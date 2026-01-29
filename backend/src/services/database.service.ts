import sql from '../db/connection';
import type { PullRequest, PRComment, PRReview, PRReport, BatchAnalysis, BatchResult, SharedReport } from '../types';

export class DatabaseService {
  async initializeSchema() {
    const schemaPath = `${import.meta.dir}/../db/schema.sql`;
    const schema = await Bun.file(schemaPath).text();
    await sql.unsafe(schema);
    console.log('Database schema initialized');
  }

  async savePullRequest(pr: PullRequest): Promise<number> {
    const result = await sql`
      INSERT INTO pull_requests (org, repo, pr_number, title, description, author, state, created_at, updated_at, raw_data)
      VALUES (${pr.org}, ${pr.repo}, ${pr.pr_number}, ${pr.title}, ${pr.description}, ${pr.author}, ${pr.state}, ${pr.created_at}, ${pr.updated_at}, ${pr.raw_data})
      ON CONFLICT (org, repo, pr_number) 
      DO UPDATE SET 
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        state = EXCLUDED.state,
        updated_at = EXCLUDED.updated_at,
        raw_data = EXCLUDED.raw_data
      RETURNING id
    `;
    return result[0].id;
  }

  async getPullRequest(org: string, repo: string, prNumber: number): Promise<PullRequest | null> {
    const result = await sql`
      SELECT * FROM pull_requests 
      WHERE org = ${org} AND repo = ${repo} AND pr_number = ${prNumber}
    `;
    return result.length > 0 ? result[0] as PullRequest : null;
  }

  async saveComment(comment: PRComment): Promise<void> {
    await sql`
      INSERT INTO pr_comments (pr_id, comment_id, author, body, created_at, raw_data)
      VALUES (${comment.pr_id}, ${comment.comment_id}, ${comment.author}, ${comment.body}, ${comment.created_at}, ${comment.raw_data})
      ON CONFLICT (comment_id) DO NOTHING
    `;
  }

  async getComments(prId: number): Promise<PRComment[]> {
    const result = await sql`
      SELECT * FROM pr_comments WHERE pr_id = ${prId} ORDER BY created_at ASC
    `;
    return result as PRComment[];
  }

  async saveReview(review: PRReview): Promise<void> {
    await sql`
      INSERT INTO pr_reviews (pr_id, review_id, author, state, body, submitted_at, raw_data)
      VALUES (${review.pr_id}, ${review.review_id}, ${review.author}, ${review.state}, ${review.body}, ${review.submitted_at}, ${review.raw_data})
      ON CONFLICT (review_id) DO NOTHING
    `;
  }

  async getReviews(prId: number): Promise<PRReview[]> {
    const result = await sql`
      SELECT * FROM pr_reviews WHERE pr_id = ${prId} ORDER BY submitted_at ASC
    `;
    return result as PRReview[];
  }

  async saveReport(report: PRReport): Promise<void> {
    await sql`
      INSERT INTO pr_reports (pr_id, report_content, generated_at)
      VALUES (${report.pr_id}, ${report.report_content}, ${report.generated_at})
      ON CONFLICT (pr_id) 
      DO UPDATE SET 
        report_content = EXCLUDED.report_content,
        generated_at = EXCLUDED.generated_at
    `;
  }

  async getReport(prId: number): Promise<PRReport | null> {
    const result = await sql`
      SELECT * FROM pr_reports WHERE pr_id = ${prId}
    `;
    return result.length > 0 ? result[0] as PRReport : null;
  }

  async deleteReport(prId: number): Promise<void> {
    await sql`
      DELETE FROM pr_reports WHERE pr_id = ${prId}
    `;
  }

  async createBatch(batch: BatchAnalysis): Promise<string> {
    const result = await sql`
      INSERT INTO batch_analyses (batch_token, pr_list, status, total_count, completed_count)
      VALUES (${batch.batch_token}, ${JSON.stringify(batch.pr_list)}, 'pending', ${batch.total_count}, 0)
      RETURNING batch_token
    `;
    return result[0].batch_token;
  }

  async getBatch(batchToken: string): Promise<BatchAnalysis | null> {
    const result = await sql`
      SELECT * FROM batch_analyses WHERE batch_token = ${batchToken}
    `;
    if (result.length === 0) return null;
    
    const batch = result[0] as any;
    return {
      ...batch,
      pr_list: typeof batch.pr_list === 'string' ? JSON.parse(batch.pr_list) : batch.pr_list,
      results: batch.results ? (typeof batch.results === 'string' ? JSON.parse(batch.results) : batch.results) : undefined,
    };
  }

  async updateBatchProgress(batchToken: string, completedCount: number, results: BatchResult[]): Promise<void> {
    await sql`
      UPDATE batch_analyses 
      SET completed_count = ${completedCount}, results = ${JSON.stringify(results)}
      WHERE batch_token = ${batchToken}
    `;
  }

  async completeBatch(batchToken: string, results: BatchResult[]): Promise<void> {
    await sql`
      UPDATE batch_analyses 
      SET status = 'completed', completed_at = NOW(), results = ${JSON.stringify(results)}
      WHERE batch_token = ${batchToken}
    `;
  }

  async failBatch(batchToken: string, errorMessage: string): Promise<void> {
    await sql`
      UPDATE batch_analyses 
      SET status = 'failed', error_message = ${errorMessage}, completed_at = NOW()
      WHERE batch_token = ${batchToken}
    `;
  }

  async startBatchProcessing(batchToken: string): Promise<void> {
    await sql`
      UPDATE batch_analyses 
      SET status = 'processing'
      WHERE batch_token = ${batchToken}
    `;
  }

  async getPRHistory(
    limit: number = 20,
    offset: number = 0,
    sortBy: 'generated_at' | 'created_at' | 'author' = 'generated_at'
  ): Promise<Array<PullRequest & { generated_at?: string }>> {
    const orderBy = 
      sortBy === 'generated_at' ? 'pr_reports.generated_at DESC' :
      sortBy === 'created_at' ? 'pull_requests.created_at DESC' :
      'pull_requests.author ASC';

    const result = await sql`
      SELECT DISTINCT 
        pr.*,
        pr_reports.generated_at
      FROM pull_requests pr
      LEFT JOIN pr_reports ON pr.id = pr_reports.pr_id
      ORDER BY ${sql.unsafe(orderBy)}
      LIMIT ${limit}
      OFFSET ${offset}
    `;
    return result as Array<PullRequest & { generated_at?: string }>;
  }

  async getPRHistoryCount(): Promise<number> {
    const result = await sql`
      SELECT COUNT(DISTINCT pr.id) as count FROM pull_requests pr
    `;
    return result[0].count as number;
  }

  async searchPRHistory(
    searchQuery?: string,
    filters?: {
      repo?: string;
      author?: string;
      state?: string;
      startDate?: string;
      endDate?: string;
    },
    limit: number = 20,
    offset: number = 0,
    sortBy: 'generated_at' | 'created_at' | 'author' = 'generated_at'
  ): Promise<Array<PullRequest & { generated_at?: string }>> {
    let whereConditions = ['1=1'];
    const params: any[] = [];

    // Search query (matches PR number, title, author)
    if (searchQuery) {
      whereConditions.push(
        `(pr.pr_number::text LIKE $${params.length + 1} OR pr.title ILIKE $${params.length + 2} OR pr.author ILIKE $${params.length + 3})`
      );
      params.push(`%${searchQuery}%`, `%${searchQuery}%`, `%${searchQuery}%`);
    }

    // Filters
    if (filters?.repo) {
      whereConditions.push(`pr.repo ILIKE $${params.length + 1}`);
      params.push(`%${filters.repo}%`);
    }
    if (filters?.author) {
      whereConditions.push(`pr.author ILIKE $${params.length + 1}`);
      params.push(`%${filters.author}%`);
    }
    if (filters?.state) {
      whereConditions.push(`pr.state = $${params.length + 1}`);
      params.push(filters.state);
    }
    if (filters?.startDate) {
      whereConditions.push(`pr.created_at >= $${params.length + 1}`);
      params.push(filters.startDate);
    }
    if (filters?.endDate) {
      whereConditions.push(`pr.created_at <= $${params.length + 1}`);
      params.push(filters.endDate);
    }

    const orderBy = 
      sortBy === 'generated_at' ? 'pr_reports.generated_at DESC' :
      sortBy === 'created_at' ? 'pr.created_at DESC' :
      'pr.author ASC';

    const whereClause = whereConditions.join(' AND ');
    const queryString = `
      SELECT DISTINCT 
        pr.*,
        pr_reports.generated_at
      FROM pull_requests pr
      LEFT JOIN pr_reports ON pr.id = pr_reports.pr_id
      WHERE ${whereClause}
      ORDER BY ${orderBy}
      LIMIT ${limit}
      OFFSET ${offset}
    `;

    const result = await sql.unsafe(queryString, params);
    return result as Array<PullRequest & { generated_at?: string }>;
  }

  async searchPRHistoryCount(
    searchQuery?: string,
    filters?: {
      repo?: string;
      author?: string;
      state?: string;
      startDate?: string;
      endDate?: string;
    }
  ): Promise<number> {
    let whereConditions = ['1=1'];
    const params: any[] = [];

    if (searchQuery) {
      whereConditions.push(
        `(pr.pr_number::text LIKE $${params.length + 1} OR pr.title ILIKE $${params.length + 2} OR pr.author ILIKE $${params.length + 3})`
      );
      params.push(`%${searchQuery}%`, `%${searchQuery}%`, `%${searchQuery}%`);
    }

    if (filters?.repo) {
      whereConditions.push(`pr.repo ILIKE $${params.length + 1}`);
      params.push(`%${filters.repo}%`);
    }
    if (filters?.author) {
      whereConditions.push(`pr.author ILIKE $${params.length + 1}`);
      params.push(`%${filters.author}%`);
    }
    if (filters?.state) {
      whereConditions.push(`pr.state = $${params.length + 1}`);
      params.push(filters.state);
    }
    if (filters?.startDate) {
      whereConditions.push(`pr.created_at >= $${params.length + 1}`);
      params.push(filters.startDate);
    }
    if (filters?.endDate) {
      whereConditions.push(`pr.created_at <= $${params.length + 1}`);
      params.push(filters.endDate);
    }

    const whereClause = whereConditions.join(' AND ');
    const queryString = `
      SELECT COUNT(DISTINCT pr.id) as count FROM pull_requests pr
      LEFT JOIN pr_reports ON pr.id = pr_reports.pr_id
      WHERE ${whereClause}
    `;

    const result = await sql.unsafe(queryString, params);
    return result[0].count as number;
  }

  async createSharedReport(shared: SharedReport): Promise<string> {
    const result = await sql`
      INSERT INTO shared_reports (report_id, share_token, password_hash, expires_at, created_by)
      VALUES (${shared.report_id}, ${shared.share_token}, ${shared.password_hash}, ${shared.expires_at}, ${shared.created_by})
      RETURNING share_token
    `;
    return result[0].share_token;
  }

  async getSharedReport(shareToken: string): Promise<SharedReport | null> {
    const result = await sql`
      SELECT * FROM shared_reports WHERE share_token = ${shareToken}
    `;
    return result.length > 0 ? (result[0] as SharedReport) : null;
  }

  async incrementShareViewCount(shareToken: string): Promise<void> {
    await sql`
      UPDATE shared_reports 
      SET view_count = view_count + 1, last_accessed_at = NOW()
      WHERE share_token = ${shareToken}
    `;
  }

  async deleteSharedReport(shareToken: string): Promise<void> {
    await sql`
      DELETE FROM shared_reports WHERE share_token = ${shareToken}
    `;
  }

  async getSharedReportByReportId(reportId: number): Promise<SharedReport | null> {
    const result = await sql`
      SELECT * FROM shared_reports WHERE report_id = ${reportId}
    `;
    return result.length > 0 ? (result[0] as SharedReport) : null;
  }

  // Commit-related methods
  async saveCommits(commits: any[]): Promise<void> {
    for (const commit of commits) {
      await sql`
        INSERT INTO pr_commits (pr_id, commit_sha, commit_message, author_name, author_email, committed_at, additions, deletions, changed_files, raw_data)
        VALUES (${commit.pr_id}, ${commit.commit_sha}, ${commit.commit_message}, ${commit.author_name}, ${commit.author_email}, ${commit.committed_at}, ${commit.additions}, ${commit.deletions}, ${commit.changed_files}, ${commit.raw_data})
        ON CONFLICT (pr_id, commit_sha) DO UPDATE SET
          commit_message = EXCLUDED.commit_message,
          author_name = EXCLUDED.author_name,
          author_email = EXCLUDED.author_email,
          committed_at = EXCLUDED.committed_at,
          additions = EXCLUDED.additions,
          deletions = EXCLUDED.deletions,
          changed_files = EXCLUDED.changed_files,
          raw_data = EXCLUDED.raw_data
      `;
    }
  }

  async getCommits(prId: number): Promise<any[]> {
    const result = await sql`
      SELECT * FROM pr_commits WHERE pr_id = ${prId} ORDER BY committed_at ASC
    `;
    return result;
  }

  async saveCommitDiff(prId: number, diffData: any): Promise<void> {
    await sql`
      INSERT INTO commit_diffs (pr_id, first_commit_sha, last_commit_sha, total_additions, total_deletions, total_changed_files, files_changed, analyzed_at)
      VALUES (${prId}, ${diffData.first_commit_sha}, ${diffData.last_commit_sha}, ${diffData.total_additions}, ${diffData.total_deletions}, ${diffData.total_changed_files}, ${JSON.stringify(diffData.files_changed)}, NOW())
      ON CONFLICT (pr_id) 
      DO UPDATE SET 
        first_commit_sha = EXCLUDED.first_commit_sha,
        last_commit_sha = EXCLUDED.last_commit_sha,
        total_additions = EXCLUDED.total_additions,
        total_deletions = EXCLUDED.total_deletions,
        total_changed_files = EXCLUDED.total_changed_files,
        files_changed = EXCLUDED.files_changed,
        analyzed_at = NOW()
    `;
  }

  async getCommitDiff(prId: number): Promise<any | null> {
    const result = await sql`
      SELECT * FROM commit_diffs WHERE pr_id = ${prId}
    `;
    if (result.length === 0) return null;
    
    const diff = result[0] as any;
    // Parse files_changed if it's a JSON string
    if (diff.files_changed && typeof diff.files_changed === 'string') {
      diff.files_changed = JSON.parse(diff.files_changed);
    }
    return diff;
  }

  async updateCommitDiffSummary(prId: number, summary: string): Promise<void> {
    await sql`
      UPDATE commit_diffs SET summary = ${summary} WHERE pr_id = ${prId}
    `;
  }

  // Last Commit Files methods (Option B - dedicated table)
  async saveLastCommitFiles(lastCommitData: any): Promise<void> {
    await sql`
      INSERT INTO last_commit_files (pr_id, commit_sha, commit_message, author_name, author_email, committed_at, total_additions, total_deletions, total_changed_files, files_changed)
      VALUES (${lastCommitData.pr_id}, ${lastCommitData.commit_sha}, ${lastCommitData.commit_message}, ${lastCommitData.author_name}, ${lastCommitData.author_email}, ${lastCommitData.committed_at}, ${lastCommitData.total_additions}, ${lastCommitData.total_deletions}, ${lastCommitData.total_changed_files}, ${JSON.stringify(lastCommitData.files_changed)})
      ON CONFLICT (pr_id) 
      DO UPDATE SET 
        commit_sha = EXCLUDED.commit_sha,
        commit_message = EXCLUDED.commit_message,
        author_name = EXCLUDED.author_name,
        author_email = EXCLUDED.author_email,
        committed_at = EXCLUDED.committed_at,
        total_additions = EXCLUDED.total_additions,
        total_deletions = EXCLUDED.total_deletions,
        total_changed_files = EXCLUDED.total_changed_files,
        files_changed = EXCLUDED.files_changed
    `;
  }

  async getLastCommitFiles(prId: number): Promise<any | null> {
    const result = await sql`
      SELECT * FROM last_commit_files WHERE pr_id = ${prId}
    `;
    if (result.length === 0) return null;
    
    const data = result[0] as any;
    // Parse files_changed if it's a JSON string
    if (data.files_changed && typeof data.files_changed === 'string') {
      data.files_changed = JSON.parse(data.files_changed);
    }
    return data;
  }

  // Review-Driven Changes methods (changes made after PR was raised, in response to reviewer feedback)
  async saveReviewDrivenChanges(prId: number, reviewData: any): Promise<void> {
    await sql`
      INSERT INTO review_driven_changes (pr_id, first_commit_sha, last_commit_sha, total_commits, review_commits, total_additions, total_deletions, total_changed_files, files_changed, has_review_changes)
      VALUES (${prId}, ${reviewData.first_commit_sha}, ${reviewData.last_commit_sha}, ${reviewData.total_commits}, ${reviewData.review_commits}, ${reviewData.total_additions}, ${reviewData.total_deletions}, ${reviewData.total_changed_files}, ${JSON.stringify(reviewData.files_changed)}, ${reviewData.has_review_changes})
      ON CONFLICT (pr_id) 
      DO UPDATE SET 
        first_commit_sha = EXCLUDED.first_commit_sha,
        last_commit_sha = EXCLUDED.last_commit_sha,
        total_commits = EXCLUDED.total_commits,
        review_commits = EXCLUDED.review_commits,
        total_additions = EXCLUDED.total_additions,
        total_deletions = EXCLUDED.total_deletions,
        total_changed_files = EXCLUDED.total_changed_files,
        files_changed = EXCLUDED.files_changed,
        has_review_changes = EXCLUDED.has_review_changes
    `;
  }

  async getReviewDrivenChanges(prId: number): Promise<any | null> {
    const result = await sql`
      SELECT * FROM review_driven_changes WHERE pr_id = ${prId}
    `;
    if (result.length === 0) return null;
    
    const data = result[0] as any;
    // Parse files_changed if it's a JSON string
    if (data.files_changed && typeof data.files_changed === 'string') {
      data.files_changed = JSON.parse(data.files_changed);
    }
    return data;
  }
}


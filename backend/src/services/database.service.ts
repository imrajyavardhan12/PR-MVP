import sql from '../db/connection';
import type { PullRequest, PRComment, PRReview, PRReport, BatchAnalysis, BatchResult } from '../types';

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
    let query = sql`
      SELECT DISTINCT 
        pr.*,
        pr_reports.generated_at
      FROM pull_requests pr
      LEFT JOIN pr_reports ON pr.id = pr_reports.pr_id
      WHERE 1=1
    `;

    // Search query (matches PR number, title, author)
    if (searchQuery) {
      query = sql`${query}
        AND (
          pr.pr_number::text LIKE ${`%${searchQuery}%`}
          OR pr.title ILIKE ${`%${searchQuery}%`}
          OR pr.author ILIKE ${`%${searchQuery}%`}
        )
      `;
    }

    // Filters
    if (filters?.repo) {
      query = sql`${query} AND pr.repo ILIKE ${`%${filters.repo}%`}`;
    }
    if (filters?.author) {
      query = sql`${query} AND pr.author ILIKE ${`%${filters.author}%`}`;
    }
    if (filters?.state) {
      query = sql`${query} AND pr.state = ${filters.state}`;
    }
    if (filters?.startDate) {
      query = sql`${query} AND pr.created_at >= ${filters.startDate}`;
    }
    if (filters?.endDate) {
      query = sql`${query} AND pr.created_at <= ${filters.endDate}`;
    }

    // Sort
    const orderBy = 
      sortBy === 'generated_at' ? 'pr_reports.generated_at DESC' :
      sortBy === 'created_at' ? 'pull_requests.created_at DESC' :
      'pull_requests.author ASC';

    query = sql`${query}
      ORDER BY ${sql.unsafe(orderBy)}
      LIMIT ${limit}
      OFFSET ${offset}
    `;

    const result = await query;
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
    let query = sql`
      SELECT COUNT(DISTINCT pr.id) as count FROM pull_requests pr
      LEFT JOIN pr_reports ON pr.id = pr_reports.pr_id
      WHERE 1=1
    `;

    if (searchQuery) {
      query = sql`${query}
        AND (
          pr.pr_number::text LIKE ${`%${searchQuery}%`}
          OR pr.title ILIKE ${`%${searchQuery}%`}
          OR pr.author ILIKE ${`%${searchQuery}%`}
        )
      `;
    }

    if (filters?.repo) {
      query = sql`${query} AND pr.repo ILIKE ${`%${filters.repo}%`}`;
    }
    if (filters?.author) {
      query = sql`${query} AND pr.author ILIKE ${`%${filters.author}%`}`;
    }
    if (filters?.state) {
      query = sql`${query} AND pr.state = ${filters.state}`;
    }
    if (filters?.startDate) {
      query = sql`${query} AND pr.created_at >= ${filters.startDate}`;
    }
    if (filters?.endDate) {
      query = sql`${query} AND pr.created_at <= ${filters.endDate}`;
    }

    const result = await query;
    return result[0].count as number;
  }
}

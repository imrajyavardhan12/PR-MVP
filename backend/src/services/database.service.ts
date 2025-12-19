import sql from '../db/connection';
import type { PullRequest, PRComment, PRReview, PRReport } from '../types';

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
}

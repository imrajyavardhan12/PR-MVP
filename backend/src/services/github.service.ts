import { Octokit } from '@octokit/rest';
import type { PullRequest, PRComment, PRReview } from '../types';

export class GitHubService {
  private octokit: Octokit;

  constructor(token: string) {
    this.octokit = new Octokit({ auth: token });
  }

  async fetchPRData(org: string, repo: string, prNumber: number) {
    // Fetch PR details
    const { data: prData } = await this.octokit.pulls.get({
      owner: org,
      repo: repo,
      pull_number: prNumber,
    });

    // Fetch comments
    const { data: commentsData } = await this.octokit.issues.listComments({
      owner: org,
      repo: repo,
      issue_number: prNumber,
    });

    // Fetch reviews
    const { data: reviewsData } = await this.octokit.pulls.listReviews({
      owner: org,
      repo: repo,
      pull_number: prNumber,
    });

    // Fetch commits
    const { data: commitsData } = await this.octokit.pulls.listCommits({
      owner: org,
      repo: repo,
      pull_number: prNumber,
      per_page: 100,
    });

    return {
      pr: prData,
      comments: commentsData,
      reviews: reviewsData,
      commits: commitsData,
    };
  }

  // Fetch commit comparison (first vs last commit)
  async fetchCommitComparison(org: string, repo: string, baseRef: string, headRef: string) {
    try {
      const { data: comparisonData } = await this.octokit.repos.compareCommits({
        owner: org,
        repo: repo,
        base: baseRef,
        head: headRef,
      });
      return comparisonData;
    } catch (error) {
      console.error('Error fetching commit comparison:', error);
      throw error;
    }
  }

  transformPRData(org: string, repo: string, prData: any): PullRequest {
    return {
      org,
      repo,
      pr_number: prData.number,
      title: prData.title,
      description: prData.body || null,
      author: prData.user.login,
      state: prData.state,
      created_at: prData.created_at,
      updated_at: prData.updated_at,
      raw_data: prData,
    };
  }

  transformComments(prId: number, commentsData: any[]): PRComment[] {
    return commentsData.map(comment => ({
      pr_id: prId,
      comment_id: comment.id,
      author: comment.user.login,
      body: comment.body,
      created_at: comment.created_at,
      raw_data: comment,
    }));
  }

  transformReviews(prId: number, reviewsData: any[]): PRReview[] {
    return reviewsData.map(review => ({
      pr_id: prId,
      review_id: review.id,
      author: review.user.login,
      state: review.state,
      body: review.body || null,
      submitted_at: review.submitted_at,
      raw_data: review,
    }));
  }

  transformCommits(prId: number, commitsData: any[]) {
    return commitsData.map(commit => ({
      pr_id: prId,
      commit_sha: commit.sha,
      commit_message: commit.commit.message,
      author_name: commit.commit.author?.name || 'Unknown',
      author_email: commit.commit.author?.email || '',
      committed_at: commit.commit.author?.date,
      additions: commit.stats?.additions || 0,
      deletions: commit.stats?.deletions || 0,
      changed_files: commit.changed_files || 0,
      raw_data: commit,
    }));
  }

  // Build summary from commit comparison
  buildCommitDiffSummary(comparison: any) {
    const files = comparison.files || [];
    
    return {
      first_commit_sha: comparison.base_commit?.sha,
      last_commit_sha: comparison.head_commit?.sha,
      total_additions: files.reduce((sum: number, f: any) => sum + (f.additions || 0), 0),
      total_deletions: files.reduce((sum: number, f: any) => sum + (f.deletions || 0), 0),
      total_changed_files: files.length,
      files_changed: files.map((file: any) => ({
        filename: file.filename,
        additions: file.additions || 0,
        deletions: file.deletions || 0,
        changes: file.changes || 0,
        status: file.status, // added, removed, modified, renamed, copied, etc.
        patch: file.patch ? file.patch.slice(0, 500) : null, // First 500 chars
      })),
    };
  }
}

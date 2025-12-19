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

    return {
      pr: prData,
      comments: commentsData,
      reviews: reviewsData,
    };
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
}

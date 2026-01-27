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
      // URL encode the refs to handle special characters in branch names
      const encodedBase = encodeURIComponent(baseRef);
      const encodedHead = encodeURIComponent(headRef);
      
      const { data: comparisonData } = await this.octokit.repos.compareCommits({
        owner: org,
        repo: repo,
        base: encodedBase,
        head: encodedHead,
      });
      return comparisonData;
    } catch (error: any) {
      console.warn('Warning: Could not fetch commit comparison (this is optional):', error.message);
      // Return null instead of throwing - commit comparison is optional
      return null;
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

  // Fallback: Build diff summary from raw GitHub commits (when API comparison fails)
  // Note: pulls.listCommits() already includes files array with patches!
  buildCommitDiffFromMetadata(commits: any[], rawGithubCommits?: any[]) {
    if (commits.length === 0) {
      return {
        first_commit_sha: null,
        last_commit_sha: null,
        total_additions: 0,
        total_deletions: 0,
        total_changed_files: 0,
        files_changed: [],
      };
    }

    const firstCommit = commits[0];
    const lastCommit = commits[commits.length - 1];

    // Sum up stats from all commits
    const totalAdditions = commits.reduce((sum, c) => sum + (c.additions || 0), 0);
    const totalDeletions = commits.reduce((sum, c) => sum + (c.deletions || 0), 0);
    const totalChangedFiles = commits.reduce((sum, c) => sum + (c.changed_files || 0), 0);

    // Extract file changes from raw GitHub commits
    // pulls.listCommits() returns: [{sha, commit, files: [{filename, additions, deletions, patch, status}, ...], ...}, ...]
    const filesChanged: any = {};
    
    if (rawGithubCommits && rawGithubCommits.length > 0) {
      rawGithubCommits.forEach((commitData: any) => {
        if (commitData.files && Array.isArray(commitData.files)) {
          commitData.files.forEach((file: any) => {
            if (!filesChanged[file.filename]) {
              filesChanged[file.filename] = {
                filename: file.filename,
                status: file.status,
                additions: 0,
                deletions: 0,
                changes: 0,
                patch: '',
              };
            }
            filesChanged[file.filename].additions += file.additions || 0;
            filesChanged[file.filename].deletions += file.deletions || 0;
            filesChanged[file.filename].changes += file.changes || 0;
            // Keep the most detailed patch
            if (file.patch && file.patch.length > filesChanged[file.filename].patch.length) {
              filesChanged[file.filename].patch = file.patch.slice(0, 2000);
            }
          });
        }
      });
    }

    return {
      first_commit_sha: firstCommit.commit_sha,
      last_commit_sha: lastCommit.commit_sha,
      total_additions: totalAdditions,
      total_deletions: totalDeletions,
      total_changed_files: totalChangedFiles,
      files_changed: Object.values(filesChanged),
      summary: `Comparison of ${commits.length} commits from ${firstCommit.commit_sha.slice(0, 7)} to ${lastCommit.commit_sha.slice(0, 7)}. Total changes: +${totalAdditions}/-${totalDeletions} across ${totalChangedFiles} files.`,
    };
  }

  // Extract key modification summary from a patch
  extractModificationSummary(patch: string): string {
    if (!patch) return 'No changes';
    
    const lines = patch.split('\n');
    const changes: string[] = [];
    
    for (const line of lines) {
      if (line.startsWith('+++') || line.startsWith('---')) continue;
      if (line.startsWith('+') && !line.startsWith('+++')) {
        changes.push(line.slice(1, 60).trim());
      }
      if (changes.length >= 2) break;
    }
    
    return changes.length > 0 ? changes.join(' | ') : 'Modified';
  }
}

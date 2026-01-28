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

    // Fetch all files changed in PR (includes patches)
    const { data: filesData } = await this.octokit.pulls.listFiles({
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
      files: filesData,
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

  async transformCommits(org: string, repo: string, prId: number, commitsData: any[]) {
    const transformed: any[] = [];

    for (const commit of commitsData) {
      let additions = 0;
      let deletions = 0;
      let changed_files = 0;

      // If commit contains files with stats, use them
      if (commit.files && Array.isArray(commit.files) && commit.files.length > 0) {
        commit.files.forEach((file: any) => {
          additions += file.additions || 0;
          deletions += file.deletions || 0;
        });
        changed_files = commit.files.length;
      }

      // If stats are present on the commit object (some endpoints include this), prefer them
      if (commit.stats && typeof commit.stats === 'object') {
        additions = commit.stats.additions || additions;
        deletions = commit.stats.deletions || deletions;
        changed_files = commit.stats.total || changed_files;
      }

      // Fallback: fetch commit details to get accurate stats
      if (additions === 0 && deletions === 0 && (!commit.files || commit.files.length === 0)) {
        try {
          const { data: commitDetails } = await this.octokit.repos.getCommit({
            owner: org,
            repo: repo,
            ref: commit.sha,
          });
          if (commitDetails && commitDetails.stats) {
            additions = commitDetails.stats.additions || additions;
            deletions = commitDetails.stats.deletions || deletions;
            changed_files = (commitDetails.files && commitDetails.files.length) || changed_files;
            // attach files to raw_data for later use if needed
            commit.files = commitDetails.files || commit.files;
          }
        } catch (err: any) {
          console.warn(`Warning: unable to fetch commit details for ${commit.sha}: ${err.message}`);
        }
      }

      transformed.push({
        pr_id: prId,
        commit_sha: commit.sha,
        commit_message: commit.commit?.message || commit.message || '',
        author_name: commit.commit?.author?.name || commit.author?.name || 'Unknown',
        author_email: commit.commit?.author?.email || commit.author?.email || '',
        committed_at: commit.commit?.author?.date || commit.commit?.committer?.date || null,
        additions,
        deletions,
        changed_files: changed_files || (commit.changed_files || 0),
        raw_data: commit,
      });
    }

    return transformed;
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
  // Use prFiles from pulls.listFiles() which has complete patch data
  buildCommitDiffFromMetadata(commits: any[], rawGithubCommits?: any[], prFiles?: any[]) {
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

    // Sum up stats from all transformed commits
    let totalAdditions = commits.reduce((sum, c) => sum + (c.additions || 0), 0);
    let totalDeletions = commits.reduce((sum, c) => sum + (c.deletions || 0), 0);
    let totalChangedFiles = commits.reduce((sum, c) => sum + (c.changed_files || 0), 0);
    
    console.log(`Commit diff stats: +${totalAdditions}/-${totalDeletions} across ${totalChangedFiles} files`);

    // Extract file changes from PR files endpoint which includes full patch data
    // pulls.listFiles() returns: [{filename, additions, deletions, patch, status, ...}, ...]
    const filesChanged: any = {};
    
    if (prFiles && prFiles.length > 0) {
      prFiles.forEach((file: any) => {
        filesChanged[file.filename] = {
          filename: file.filename,
          status: file.status,
          additions: file.additions || 0,
          deletions: file.deletions || 0,
          changes: file.changes || 0,
          patch: file.patch ? file.patch.slice(0, 2000) : '',
        };
      });
      console.log(`Extracted ${Object.keys(filesChanged).length} files from PR files endpoint:`, 
        Object.keys(filesChanged).map(f => ({ file: f, hasPatch: filesChanged[f].patch.length > 0 }))
      );
      // Recalculate totals from PR files when available - these are authoritative for additions/deletions
      totalAdditions = Object.values(filesChanged).reduce((s: number, f: any) => s + (f.additions || 0), 0);
      totalDeletions = Object.values(filesChanged).reduce((s: number, f: any) => s + (f.deletions || 0), 0);
      totalChangedFiles = Object.keys(filesChanged).length;
    } else if (rawGithubCommits && rawGithubCommits.length > 0) {
      // Fallback to commit files if PR files not available
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

  // Build last commit files data (Option B - only last commit)
  buildLastCommitFiles(lastCommitData: any, filesData: any[]): any {
    if (!lastCommitData) {
      return {
        commit_sha: null,
        commit_message: null,
        author_name: null,
        author_email: null,
        committed_at: null,
        total_additions: 0,
        total_deletions: 0,
        total_changed_files: 0,
        files_changed: [],
      };
    }

    const files = filesData || [];
    
    return {
      pr_id: null, // Will be set by caller
      commit_sha: lastCommitData.sha,
      commit_message: lastCommitData.commit?.message || lastCommitData.message || '',
      author_name: lastCommitData.commit?.author?.name || lastCommitData.author?.name || 'Unknown',
      author_email: lastCommitData.commit?.author?.email || lastCommitData.author?.email || '',
      committed_at: lastCommitData.commit?.author?.date || lastCommitData.commit?.committer?.date || null,
      total_additions: files.reduce((sum: number, f: any) => sum + (f.additions || 0), 0),
      total_deletions: files.reduce((sum: number, f: any) => sum + (f.deletions || 0), 0),
      total_changed_files: files.length,
      files_changed: files.map((file: any) => ({
        filename: file.filename,
        additions: file.additions || 0,
        deletions: file.deletions || 0,
        changes: file.changes || 0,
        status: file.status, // added, removed, modified, renamed, copied, etc.
        patch: file.patch ? file.patch.slice(0, 2000) : '', // First 2000 chars
      })),
    };
  }
}


import { DatabaseService } from './database.service';
import { GitHubService } from './github.service';
import { OpenAIService } from './openai.service';
import type { BatchResult } from '../types';
import { randomBytes } from 'crypto';

export class BatchService {
  private dbService: DatabaseService;
  private githubService: GitHubService;
  private openaiService: OpenAIService;
  private concurrencyLimit: number = 2;
  private prTimeoutMs: number = 60000; // 60 seconds per PR (increased for commit/review analysis)
  private batchTimeoutMs: number = 900000; // 15 minutes total

  constructor(githubToken: string, openaiKey: string, concurrencyLimit: number = 2) {
    this.dbService = new DatabaseService();
    this.githubService = new GitHubService(githubToken);
    this.openaiService = new OpenAIService(openaiKey);
    this.concurrencyLimit = concurrencyLimit;
  }

  generateBatchToken(): string {
    return `batch_${randomBytes(16).toString('hex')}`;
  }

  async processBatch(
    batchToken: string,
    prList: Array<{ org: string; repo: string; pr_number: number }>
  ): Promise<void> {
    try {
      // Start processing
      await this.dbService.startBatchProcessing(batchToken);

      const results: BatchResult[] = [];
      const batchStartTime = Date.now();

      // Process PRs with concurrency limit
      for (let i = 0; i < prList.length; i += this.concurrencyLimit) {
        // Check batch timeout
        if (Date.now() - batchStartTime > this.batchTimeoutMs) {
          throw new Error('Batch processing timeout exceeded');
        }

        const chunk = prList.slice(i, i + this.concurrencyLimit);
        const promises = chunk.map((pr) =>
          this.processSinglePRWithTimeout(pr)
        );

        const chunkResults = await Promise.allSettled(promises);

        for (let j = 0; j < chunkResults.length; j++) {
          const result = chunkResults[j];
          if (result.status === 'fulfilled') {
            results.push(result.value);
          } else {
            const pr = chunk[j];
            results.push({
              org: pr.org,
              repo: pr.repo,
              pr_number: pr.pr_number,
              success: false,
              error: result.reason?.message || 'Unknown error',
            });
          }
        }

        // Update progress
        await this.dbService.updateBatchProgress(batchToken, results.length, results);
      }

      // Complete batch
      await this.dbService.completeBatch(batchToken, results);
    } catch (error: any) {
      console.error(`Batch ${batchToken} failed:`, error);
      await this.dbService.failBatch(batchToken, error.message);
    }
  }

  private async processSinglePRWithTimeout(pr: {
    org: string;
    repo: string;
    pr_number: number;
  }): Promise<BatchResult> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error(`Timeout processing ${pr.org}/${pr.repo}#${pr.pr_number}`)),
        this.prTimeoutMs
      );

      this.processSinglePR(pr)
        .then((result) => {
          clearTimeout(timeout);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timeout);
          reject(error);
        });
    });
  }

  private async processSinglePR(pr: {
    org: string;
    repo: string;
    pr_number: number;
  }): Promise<BatchResult> {
    try {
      const { org, repo, pr_number } = pr;

      // Check cache first
      const existingPR = await this.dbService.getPullRequest(org, repo, pr_number);
      if (existingPR && existingPR.id) {
        const existingReport = await this.dbService.getReport(existingPR.id);
        if (existingReport) {
          return {
            org,
            repo,
            pr_number,
            success: true,
            pr: existingPR,
            report: existingReport,
          };
        }
      }

      // Fetch from GitHub
      const githubData = await this.githubService.fetchPRData(org, repo, pr_number);

      // Transform and save
      const prData = this.githubService.transformPRData(org, repo, githubData.pr);
      const prId = await this.dbService.savePullRequest(prData);

      const comments = this.githubService.transformComments(prId, githubData.comments);
      const reviews = this.githubService.transformReviews(prId, githubData.reviews);

      for (const comment of comments) {
        await this.dbService.saveComment(comment);
      }

      for (const review of reviews) {
        await this.dbService.saveReview(review);
      }

      // Save commits
      let commits: any[] = [];
      if (githubData.commits && githubData.commits.length > 0) {
        commits = await this.githubService.transformCommits(org, repo, prId, githubData.commits);
        await this.dbService.saveCommits(commits);

        // Save last commit files
        if (commits.length > 0) {
          const lastCommitRawData = githubData.commits[githubData.commits.length - 1];
          const lastCommitFiles = this.githubService.buildLastCommitFiles(lastCommitRawData, githubData.files);
          lastCommitFiles.pr_id = prId;
          await this.dbService.saveLastCommitFiles(lastCommitFiles);
        }

        // Fetch commit comparison (first vs last commit)
        const baseRef = githubData.pr.base.ref;
        const headRef = githubData.pr.head.ref;
        const comparison = await this.githubService.fetchCommitComparison(org, repo, baseRef, headRef);

        if (comparison && Array.isArray(comparison.files) && comparison.files.length > 0) {
          const diffSummary = this.githubService.buildCommitDiffSummary(comparison);
          await this.dbService.saveCommitDiff(prId, diffSummary);
        } else {
          const fallbackDiff = this.githubService.buildCommitDiffFromMetadata(
            commits,
            githubData.commits,
            githubData.files
          );
          await this.dbService.saveCommitDiff(prId, fallbackDiff);
        }

        // Calculate and save review-driven changes
        const prFileNames = new Set(githubData.files.map((f: any) => f.filename));
        
        // Filter out merge commits
        const nonMergeCommits = commits.filter((c: any) => {
          const message = c.commit_message || '';
          const isMerge = message.toLowerCase().startsWith('merge ') || 
                          message.toLowerCase().includes('merge branch') ||
                          message.toLowerCase().includes('merge pull request');
          const parentCount = c.raw_data?.parents?.length || 1;
          return !isMerge && parentCount <= 1;
        });
        
        const effectiveCommits = nonMergeCommits.length > 0 ? nonMergeCommits : commits;
        
        if (effectiveCommits.length > 1) {
          const firstCommitSha = effectiveCommits[0].commit_sha;
          const lastCommitSha = effectiveCommits[effectiveCommits.length - 1].commit_sha;
          const reviewComparison = await this.githubService.fetchReviewDrivenChanges(org, repo, firstCommitSha, lastCommitSha);
          const reviewChanges = this.githubService.buildReviewDrivenChanges(effectiveCommits, reviewComparison, prFileNames);
          await this.dbService.saveReviewDrivenChanges(prId, reviewChanges);
        } else {
          const noReviewChanges = this.githubService.buildReviewDrivenChanges(effectiveCommits, null, prFileNames);
          await this.dbService.saveReviewDrivenChanges(prId, noReviewChanges);
        }
      }

      // Generate LLM report (with commit context for better analysis)
      const commitDiffData = await this.dbService.getCommitDiff(prId);
      const reviewDrivenChangesData = await this.dbService.getReviewDrivenChanges(prId);
      const reportContent = await this.openaiService.generatePRReport({
        pr: prData,
        comments,
        reviews,
        commits: commits || [],
        commitDiff: commitDiffData,
        reviewDrivenChanges: reviewDrivenChangesData,
      });

      await this.dbService.saveReport({
        pr_id: prId,
        report_content: reportContent,
        generated_at: new Date().toISOString(),
      });

      // Fetch saved data
      const savedPR = await this.dbService.getPullRequest(org, repo, pr_number);
      const savedReport = await this.dbService.getReport(prId);

      return {
        org,
        repo,
        pr_number,
        success: true,
        pr: savedPR || undefined,
        report: savedReport || undefined,
      };
    } catch (error: any) {
      return {
        org: pr.org,
        repo: pr.repo,
        pr_number: pr.pr_number,
        success: false,
        error: error.message || 'Failed to process PR',
      };
    }
  }
}

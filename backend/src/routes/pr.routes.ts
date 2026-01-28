import { Hono } from 'hono';
import { DatabaseService } from '../services/database.service';
import { GitHubService } from '../services/github.service';
import { OpenAIService } from '../services/openai.service';
import historyRoutes from './history.routes';
import exportRoutes from './export.routes';

const prRoutes = new Hono();

const dbService = new DatabaseService();
const githubService = new GitHubService(process.env.GITHUB_TOKEN!);
const openaiService = new OpenAIService(process.env.OPENAI_API_KEY!);

prRoutes.post('/report', async (c) => {
  try {
    const { org, repo, pr_number } = await c.req.json();

    if (!org || !repo || !pr_number) {
      return c.json({ error: 'Missing required fields: org, repo, pr_number' }, 400);
    }

    // Check if report already exists
    const existingPR = await dbService.getPullRequest(org, repo, pr_number);
    
    if (existingPR) {
      const existingReport = await dbService.getReport(existingPR.id!);
      if (existingReport) {
        return c.json({
          message: 'Report already exists (cached)',
          cached: true,
          pr: existingPR,
          report: existingReport,
        });
      }
    }

    // Fetch PR data from GitHub
    console.log(`Fetching PR data for ${org}/${repo}#${pr_number}...`);
    const githubData = await githubService.fetchPRData(org, repo, pr_number);

    // Save PR to database
    const prData = githubService.transformPRData(org, repo, githubData.pr);
    const prId = await dbService.savePullRequest(prData);

    // Save comments and reviews
    const comments = githubService.transformComments(prId, githubData.comments);
    const reviews = githubService.transformReviews(prId, githubData.reviews);

    for (const comment of comments) {
      await dbService.saveComment(comment);
    }

    for (const review of reviews) {
      await dbService.saveReview(review);
    }

    // Save commits
    let commits: any[] = [];
    if (githubData.commits && githubData.commits.length > 0) {
      commits = await githubService.transformCommits(org, repo, prId, githubData.commits);
      await dbService.saveCommits(commits);

    // NEW (Option B): Save last commit files separately
    console.log('Saving last commit files...');
    if (commits.length > 0) {
      const lastCommitData = commits[commits.length - 1];
      const lastCommitRawData = githubData.commits[githubData.commits.length - 1];
      
      const lastCommitFiles = githubService.buildLastCommitFiles(lastCommitRawData, githubData.files);
      lastCommitFiles.pr_id = prId;
      await dbService.saveLastCommitFiles(lastCommitFiles);
    }

    // Fetch commit comparison (first vs last commit)
    console.log('Fetching commit comparison...');
    const baseRef = githubData.pr.base.ref;
    const headRef = githubData.pr.head.ref;
    const comparison = await githubService.fetchCommitComparison(org, repo, baseRef, headRef);

    // Prefer using the comparison result when it contains file changes.
    // If comparison exists but has no files, fall back to the PR files data
    // returned by the pulls.listFiles() endpoint (githubData.files).
    if (comparison && Array.isArray(comparison.files) && comparison.files.length > 0) {
      console.log('Using comparison API files for diff summary');
      const diffSummary = githubService.buildCommitDiffSummary(comparison);
      await dbService.saveCommitDiff(prId, diffSummary);
    } else {
      console.log('Comparison API missing file details; falling back to PR files metadata');
      const fallbackDiff = githubService.buildCommitDiffFromMetadata(
        commits,
        githubData.commits,
        githubData.files // Pull files from the PR endpoint
      );
      await dbService.saveCommitDiff(prId, fallbackDiff);
    }
    }

    // Generate LLM report (with commit context for better analysis)
    console.log('Generating LLM report...');
    const commitDiffData = await dbService.getCommitDiff(prId);
    const reportContent = await openaiService.generatePRReport({
      pr: prData,
      comments,
      reviews,
      commits: commits || [],
      commitDiff: commitDiffData,
    });

    // Save report
    await dbService.saveReport({
      pr_id: prId,
      report_content: reportContent,
      generated_at: new Date().toISOString(),
    });

    // Fetch saved data
    const savedPR = await dbService.getPullRequest(org, repo, pr_number);
    const savedReport = await dbService.getReport(prId);

    return c.json({
      message: 'Report generated successfully',
      cached: false,
      pr: savedPR,
      report: savedReport,
    });
  } catch (error: any) {
    console.error('Error generating report:', error);
    return c.json({ 
      error: 'Failed to generate report', 
      details: error.message 
    }, 500);
  }
});

prRoutes.get('/report/:org/:repo/:pr_number', async (c) => {
  try {
    const org = c.req.param('org');
    const repo = c.req.param('repo');
    const pr_number = parseInt(c.req.param('pr_number'));

    const pr = await dbService.getPullRequest(org, repo, pr_number);
    
    if (!pr) {
      return c.json({ error: 'PR not found' }, 404);
    }

    const report = await dbService.getReport(pr.id!);
    
    if (!report) {
      return c.json({ error: 'Report not found' }, 404);
    }

    const comments = await dbService.getComments(pr.id!);
    const reviews = await dbService.getReviews(pr.id!);
    const commits = await dbService.getCommits(pr.id!);
    const commitDiff = await dbService.getCommitDiff(pr.id!);

    return c.json({
      pr,
      report,
      comments,
      reviews,
      commits,
      commitDiff,
    });
  } catch (error: any) {
    console.error('Error fetching report:', error);
    return c.json({ 
      error: 'Failed to fetch report', 
      details: error.message 
    }, 500);
  }
});

// GET /api/pr/commits/:org/:repo/:pr_number (DEPRECATED - kept for compatibility)
// Now returns aggregated commit comparison (first vs last)
prRoutes.get('/commits/:org/:repo/:pr_number', async (c) => {
  try {
    const org = c.req.param('org');
    const repo = c.req.param('repo');
    const pr_number = parseInt(c.req.param('pr_number'));

    const pr = await dbService.getPullRequest(org, repo, pr_number);
    
    if (!pr) {
      return c.json({ error: 'PR not found' }, 404);
    }

    const commits = await dbService.getCommits(pr.id!);
    const commitDiff = await dbService.getCommitDiff(pr.id!);

    return c.json({
      pr_number,
      org,
      repo,
      total_commits: commits.length,
      commits,
      commitDiff: commitDiff || {
        total_additions: 0,
        total_deletions: 0,
        total_changed_files: 0,
        files_changed: [],
      },
    });
  } catch (error: any) {
    console.error('Error fetching commits:', error);
    return c.json({ 
      error: 'Failed to fetch commits', 
      details: error.message 
    }, 500);
  }
});

// GET /api/pr/last-commit/:org/:repo/:pr_number (NEW - Option B)
// Get ONLY the last commit's file changes
prRoutes.get('/last-commit/:org/:repo/:pr_number', async (c) => {
  try {
    const org = c.req.param('org');
    const repo = c.req.param('repo');
    const pr_number = parseInt(c.req.param('pr_number'));

    const pr = await dbService.getPullRequest(org, repo, pr_number);
    
    if (!pr) {
      return c.json({ error: 'PR not found' }, 404);
    }

    const lastCommitFiles = await dbService.getLastCommitFiles(pr.id!);

    if (!lastCommitFiles) {
      return c.json({ error: 'Last commit data not found' }, 404);
    }

    return c.json({
      org,
      repo,
      pr_number,
      lastCommit: {
        commit_sha: lastCommitFiles.commit_sha,
        commit_message: lastCommitFiles.commit_message,
        author_name: lastCommitFiles.author_name,
        author_email: lastCommitFiles.author_email,
        committed_at: lastCommitFiles.committed_at,
        total_additions: lastCommitFiles.total_additions,
        total_deletions: lastCommitFiles.total_deletions,
        total_changed_files: lastCommitFiles.total_changed_files,
      },
      files_changed: lastCommitFiles.files_changed,
    });
  } catch (error: any) {
    console.error('Error fetching last commit:', error);
    return c.json({ 
      error: 'Failed to fetch last commit', 
      details: error.message 
    }, 500);
  }
});

// History routes
prRoutes.route('/', historyRoutes);

// Export routes
prRoutes.route('/', exportRoutes);

// DELETE /api/pr/report/:org/:repo/:pr_number
prRoutes.delete('/report/:org/:repo/:pr_number', async (c) => {
  try {
    const org = c.req.param('org');
    const repo = c.req.param('repo');
    const pr_number = parseInt(c.req.param('pr_number'));

    const pr = await dbService.getPullRequest(org, repo, pr_number);
    if (!pr) {
      return c.json({ error: 'PR not found' }, 404);
    }

    // Ensure report exists
    const report = await dbService.getReport(pr.id!);
    if (!report) {
      return c.json({ error: 'Report not found' }, 404);
    }

    await dbService.deleteReport(pr.id!);

    return c.json({ message: 'Report deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting report:', error);
    return c.json({ error: 'Failed to delete report', details: error.message }, 500);
  }
});

export default prRoutes;


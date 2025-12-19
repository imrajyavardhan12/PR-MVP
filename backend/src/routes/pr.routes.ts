import { Hono } from 'hono';
import { DatabaseService } from '../services/database.service';
import { GitHubService } from '../services/github.service';
import { OpenAIService } from '../services/openai.service';

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

    // Generate LLM report
    console.log('Generating LLM report...');
    const reportContent = await openaiService.generatePRReport({
      pr: prData,
      comments,
      reviews,
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

    return c.json({
      pr,
      report,
      comments,
      reviews,
    });
  } catch (error: any) {
    console.error('Error fetching report:', error);
    return c.json({ 
      error: 'Failed to fetch report', 
      details: error.message 
    }, 500);
  }
});

export default prRoutes;

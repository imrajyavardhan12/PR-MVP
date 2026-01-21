import { Hono } from 'hono';
import { DatabaseService } from '../services/database.service';
import { BatchService } from '../services/batch.service';
import type { BatchAnalysis } from '../types';

const batchRoutes = new Hono();
const dbService = new DatabaseService();

function parsePRInput(input: string): { org: string; repo: string; pr_number: number } | null {
  // Remove whitespace
  input = input.trim();

  // Try different formats
  // 1. github.com/owner/repo/pull/123
  const urlMatch = input.match(/github\.com\/([^\/]+)\/([^\/]+)\/pull\/(\d+)/);
  if (urlMatch) {
    return { org: urlMatch[1], repo: urlMatch[2], pr_number: parseInt(urlMatch[3]) };
  }

  // 2. github.com/owner/repo/123
  const urlNoPullMatch = input.match(/github\.com\/([^\/]+)\/([^\/]+)\/(\d+)$/);
  if (urlNoPullMatch) {
    return { org: urlNoPullMatch[1], repo: urlNoPullMatch[2], pr_number: parseInt(urlNoPullMatch[3]) };
  }

  // 3. github.com/owner/repo#123
  const mixedMatch = input.match(/github\.com\/([^\/]+)\/([^#]+)#(\d+)/);
  if (mixedMatch) {
    return { org: mixedMatch[1], repo: mixedMatch[2], pr_number: parseInt(mixedMatch[3]) };
  }

  // 4. owner/repo#123
  const shortMatch = input.match(/^([^\/]+)\/([^#]+)#(\d+)$/);
  if (shortMatch) {
    return { org: shortMatch[1], repo: shortMatch[2], pr_number: parseInt(shortMatch[3]) };
  }

  return null;
}

batchRoutes.post('/batch', async (c) => {
  try {
    const { pr_list } = await c.req.json();

    if (!pr_list || !Array.isArray(pr_list) || pr_list.length === 0) {
      return c.json(
        { error: 'Invalid input: pr_list must be a non-empty array' },
        400
      );
    }

    if (pr_list.length > 100) {
      return c.json(
        { error: 'Too many PRs: maximum 100 PRs per batch' },
        400
      );
    }

    // Parse PR inputs
    const parsedPRs = [];
    const errors: string[] = [];

    for (let i = 0; i < pr_list.length; i++) {
      const parsed = parsePRInput(pr_list[i]);
      if (parsed) {
        parsedPRs.push(parsed);
      } else {
        errors.push(`Line ${i + 1}: Invalid format "${pr_list[i]}"`);
      }
    }

    if (parsedPRs.length === 0) {
      return c.json(
        { error: 'No valid PRs found', details: errors },
        400
      );
    }

    // Create batch
    const batchService = new BatchService(
      process.env.GITHUB_TOKEN!,
      process.env.OPENAI_API_KEY!,
      2
    );

    const batchToken = batchService.generateBatchToken();
    const batch: BatchAnalysis = {
      batch_token: batchToken,
      pr_list: parsedPRs,
      status: 'pending',
      completed_count: 0,
      total_count: parsedPRs.length,
    };

    await dbService.createBatch(batch);

    // Start processing in background
    batchService.processBatch(batchToken, parsedPRs).catch((error) => {
      console.error(`Batch ${batchToken} processing failed:`, error);
    });

    return c.json({
      message: 'Batch analysis started',
      batch_token: batchToken,
      total_prs: parsedPRs.length,
      invalid_inputs: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    console.error('Error creating batch:', error);
    return c.json(
      {
        error: 'Failed to create batch',
        details: error.message,
      },
      500
    );
  }
});

batchRoutes.get('/batch/:batchId', async (c) => {
  try {
    const batchId = c.req.param('batchId');

    const batch = await dbService.getBatch(batchId);

    if (!batch) {
      return c.json({ error: 'Batch not found' }, 404);
    }

    return c.json({
      batch_token: batch.batch_token,
      status: batch.status,
      total_prs: batch.total_count,
      completed_prs: batch.completed_count,
      progress_percentage: batch.total_count > 0 
        ? Math.round((batch.completed_count / batch.total_count) * 100) 
        : 0,
      results: batch.results || [],
      created_at: batch.created_at,
      completed_at: batch.completed_at,
      error_message: batch.error_message,
    });
  } catch (error: any) {
    console.error('Error fetching batch:', error);
    return c.json(
      {
        error: 'Failed to fetch batch',
        details: error.message,
      },
      500
    );
  }
});

export default batchRoutes;

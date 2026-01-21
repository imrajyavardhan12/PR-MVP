import { Hono } from 'hono';
import { DatabaseService } from '../services/database.service';
import { ExportService, type ExportFormat } from '../services/export.service';
import { randomBytes } from 'crypto';

const exportRoutes = new Hono();
const dbService = new DatabaseService();
const exportService = new ExportService();

// POST /api/pr/export/:org/:repo/:pr_number
// Export PR report in specified format
exportRoutes.post('/export/:org/:repo/:pr_number', async (c) => {
  try {
    const org = c.req.param('org');
    const repo = c.req.param('repo');
    const pr_number = parseInt(c.req.param('pr_number'));
    const { format = 'markdown' } = await c.req.json();

    if (!['markdown', 'json', 'html'].includes(format)) {
      return c.json({ error: 'Invalid format. Supported: markdown, json, html' }, 400);
    }

    // Fetch PR and report
    const pr = await dbService.getPullRequest(org, repo, pr_number);
    if (!pr || !pr.id) {
      return c.json({ error: 'PR not found' }, 404);
    }

    const report = await dbService.getReport(pr.id);
    if (!report) {
      return c.json({ error: 'Report not found' }, 404);
    }

    const comments = await dbService.getComments(pr.id);
    const reviews = await dbService.getReviews(pr.id);

    // Generate export
    let content: string;
    let mimeType: string;

    switch (format as ExportFormat) {
      case 'json':
        content = exportService.generateJSON(pr, report, comments, reviews);
        mimeType = 'application/json';
        break;
      case 'html':
        content = exportService.generateHTML(pr, report, comments, reviews);
        mimeType = 'text/html';
        break;
      case 'markdown':
      default:
        content = exportService.generateMarkdown(pr, report, comments, reviews);
        mimeType = 'text/markdown';
    }

    const filename = `pr-${org}-${repo}-${pr_number}-analysis.${exportService.getFileExtension(format as ExportFormat)}`;

    c.header('Content-Type', mimeType);
    c.header('Content-Disposition', `attachment; filename="${filename}"`);
    return c.text(content);
  } catch (error: any) {
    console.error('Error exporting report:', error);
    return c.json(
      {
        error: 'Failed to export report',
        details: error.message,
      },
      500
    );
  }
});

// POST /api/pr/share/:org/:repo/:pr_number
// Create shareable link
exportRoutes.post('/share/:org/:repo/:pr_number', async (c) => {
  try {
    const org = c.req.param('org');
    const repo = c.req.param('repo');
    const pr_number = parseInt(c.req.param('pr_number'));
    const { expiresIn = null, password = null } = await c.req.json();

    // Fetch PR and report
    const pr = await dbService.getPullRequest(org, repo, pr_number);
    if (!pr || !pr.id) {
      return c.json({ error: 'PR not found' }, 404);
    }

    const report = await dbService.getReport(pr.id);
    if (!report) {
      return c.json({ error: 'Report not found' }, 404);
    }

    // Check if share already exists
    let existing = await dbService.getSharedReportByReportId(pr.id);
    if (existing) {
      return c.json({
        share_token: existing.share_token,
        share_url: `${c.req.header('origin') || 'http://localhost:3000'}/share/${existing.share_token}`,
        expires_at: existing.expires_at,
        view_count: existing.view_count,
      });
    }

    // Generate token
    const shareToken = randomBytes(24).toString('hex');

    // Calculate expiration
    let expiresAt = null;
    if (expiresIn) {
      const now = new Date();
      switch (expiresIn) {
        case '1d':
          now.setDate(now.getDate() + 1);
          break;
        case '7d':
          now.setDate(now.getDate() + 7);
          break;
        case '30d':
          now.setDate(now.getDate() + 30);
          break;
        case 'never':
          expiresAt = null;
          break;
      }
      if (expiresAt !== null) expiresAt = now.toISOString();
    }

    // Hash password if provided
    let passwordHash = null;
    if (password) {
      const crypto = await import('crypto');
      passwordHash = crypto.createHash('sha256').update(password).digest('hex');
    }

    // Create share
    const token = await dbService.createSharedReport({
      report_id: pr.id,
      share_token: shareToken,
      password_hash: passwordHash,
      expires_at: expiresAt,
      view_count: 0,
      created_by: 'anonymous',
    });

    return c.json({
      share_token: token,
      share_url: `${c.req.header('origin') || 'http://localhost:3000'}/share/${token}`,
      expires_at: expiresAt,
      view_count: 0,
      has_password: !!password,
    });
  } catch (error: any) {
    console.error('Error creating share:', error);
    return c.json(
      {
        error: 'Failed to create share',
        details: error.message,
      },
      500
    );
  }
});

// GET /api/pr/share/:token
// Get shared report
exportRoutes.get('/share/:token', async (c) => {
  try {
    const token = c.req.param('token');
    const { password = null } = await c.req.query();

    const share = await dbService.getSharedReport(token);
    if (!share) {
      return c.json({ error: 'Share not found or expired' }, 404);
    }

    // Check expiration
    if (share.expires_at && new Date(share.expires_at) < new Date()) {
      return c.json({ error: 'Share link has expired' }, 410);
    }

    // Check password
    if (share.password_hash && password) {
      const crypto = await import('crypto');
      const hash = crypto.createHash('sha256').update(password).digest('hex');
      if (hash !== share.password_hash) {
        return c.json({ error: 'Invalid password' }, 403);
      }
    } else if (share.password_hash && !password) {
      // Password protected but not provided
      return c.json({ requires_password: true }, 403);
    }

    // Increment view count
    await dbService.incrementShareViewCount(token);

    // Fetch full report data
    const report = await dbService.getReport(share.report_id);
    if (!report) {
      return c.json({ error: 'Report not found' }, 404);
    }

    // Get PR data from report - need to fetch from raw data or reconstruct
    // For now, return the report
    return c.json({
      report,
      share_info: {
        token,
        created_at: share.created_at,
        view_count: share.view_count,
        expires_at: share.expires_at,
      },
    });
  } catch (error: any) {
    console.error('Error fetching shared report:', error);
    return c.json(
      {
        error: 'Failed to fetch shared report',
        details: error.message,
      },
      500
    );
  }
});

// DELETE /api/pr/share/:token
// Delete shared link
exportRoutes.delete('/share/:token', async (c) => {
  try {
    const token = c.req.param('token');

    await dbService.deleteSharedReport(token);

    return c.json({ message: 'Share link deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting share:', error);
    return c.json(
      {
        error: 'Failed to delete share',
        details: error.message,
      },
      500
    );
  }
});

export default exportRoutes;

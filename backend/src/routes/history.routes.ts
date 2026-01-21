import { Hono } from 'hono';
import { DatabaseService } from '../services/database.service';

const historyRoutes = new Hono();
const dbService = new DatabaseService();

// GET /api/pr/history - List all analyzed PRs with pagination
historyRoutes.get('/history', async (c) => {
  try {
    const page = parseInt(c.req.query('page') || '1');
    const pageSize = Math.min(parseInt(c.req.query('pageSize') || '20'), 100);
    const sortBy = (c.req.query('sortBy') || 'generated_at') as 'generated_at' | 'created_at' | 'author';

    if (page < 1) {
      return c.json({ error: 'Page must be >= 1' }, 400);
    }

    const offset = (page - 1) * pageSize;

    const [prs, total] = await Promise.all([
      dbService.getPRHistory(pageSize, offset, sortBy),
      dbService.getPRHistoryCount(),
    ]);

    const totalPages = Math.ceil(total / pageSize);

    return c.json({
      data: prs,
      pagination: {
        page,
        pageSize,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  } catch (error: any) {
    console.error('Error fetching PR history:', error);
    return c.json(
      {
        error: 'Failed to fetch PR history',
        details: error.message,
      },
      500
    );
  }
});

// GET /api/pr/history/search - Search and filter PRs
historyRoutes.get('/history/search', async (c) => {
  try {
    const page = parseInt(c.req.query('page') || '1');
    const pageSize = Math.min(parseInt(c.req.query('pageSize') || '20'), 100);
    const q = c.req.query('q') || undefined;
    const repo = c.req.query('repo') || undefined;
    const author = c.req.query('author') || undefined;
    const state = c.req.query('state') || undefined;
    const startDate = c.req.query('startDate') || undefined;
    const endDate = c.req.query('endDate') || undefined;
    const sortBy = (c.req.query('sortBy') || 'generated_at') as 'generated_at' | 'created_at' | 'author';

    if (page < 1) {
      return c.json({ error: 'Page must be >= 1' }, 400);
    }

    const offset = (page - 1) * pageSize;

    const filters = {
      repo,
      author,
      state: state && ['open', 'closed', 'merged'].includes(state) ? state : undefined,
      startDate,
      endDate,
    };

    const [prs, total] = await Promise.all([
      dbService.searchPRHistory(q, filters, pageSize, offset, sortBy),
      dbService.searchPRHistoryCount(q, filters),
    ]);

    const totalPages = Math.ceil(total / pageSize);

    return c.json({
      data: prs,
      pagination: {
        page,
        pageSize,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  } catch (error: any) {
    console.error('Error searching PR history:', error);
    return c.json(
      {
        error: 'Failed to search PR history',
        details: error.message,
      },
      500
    );
  }
});

export default historyRoutes;

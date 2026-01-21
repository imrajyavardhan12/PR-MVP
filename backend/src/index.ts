import { Hono } from 'hono';
import { cors } from 'hono/cors';
import prRoutes from './routes/pr.routes';
import batchRoutes from './routes/batch.routes';
import { DatabaseService } from './services/database.service';

const app = new Hono();

// CORS middleware
app.use('/*', cors({
  origin: '*',
}));

// Health check
app.get('/', (c) => {
  return c.json({ status: 'ok', message: 'PR Analysis API is running' });
});

// Batch routes (mount first)
app.route('/api', batchRoutes);

// PR routes
app.route('/api/pr', prRoutes);

// Initialize database on startup
const dbService = new DatabaseService();
await dbService.initializeSchema();

console.log('Server is running on http://localhost:3000');

export default {
  port: 3000,
  hostname: '0.0.0.0',
  fetch: app.fetch,
};

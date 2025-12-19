import { Hono } from 'hono';
import { cors } from 'hono/cors';
import prRoutes from './routes/pr.routes';
import { DatabaseService } from './services/database.service';

const app = new Hono();

// CORS middleware
app.use('/*', cors());

// Health check
app.get('/', (c) => {
  return c.json({ status: 'ok', message: 'PR Analysis API is running' });
});

// PR routes
app.route('/api/pr', prRoutes);

// Initialize database on startup
const dbService = new DatabaseService();
await dbService.initializeSchema();

console.log('Server is running on http://localhost:3000');

export default {
  port: 3000,
  fetch: app.fetch,
};

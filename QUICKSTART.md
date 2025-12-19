# Quick Start Guide

## 1. Start Database (1 command)

```bash
docker-compose up -d
```

Wait 10 seconds for PostgreSQL to initialize.

## 2. Configure Backend

```bash
cd backend
```

Edit `.env` file and add your tokens:
- `GITHUB_TOKEN` - Your GitHub Classic Personal Access Token
- `OPENAI_API_KEY` - Your OpenAI API Key

## 3. Start Backend (1 command)

```bash
cd backend
bun run dev
```

Backend runs on: http://localhost:3000

## 4. Start Frontend (new terminal)

```bash
cd frontend
bun run dev
```

Frontend runs on: http://localhost:5173

## 5. Use the Tool

1. Open http://localhost:5173
2. Enter: `facebook/react#31479` (or any public PR)
3. Click "Generate Report"
4. Wait ~5-10 seconds for first-time generation
5. Subsequent requests for the same PR return instantly (cached)

## Testing API Directly

```bash
curl -X POST http://localhost:3000/api/pr/report \
  -H "Content-Type: application/json" \
  -d '{
    "org": "facebook",
    "repo": "react",
    "pr_number": 31479
  }'
```

## Stopping

```bash
# Stop frontend: Ctrl+C in frontend terminal
# Stop backend: Ctrl+C in backend terminal
# Stop database:
docker-compose down
```

## Troubleshooting

**"Cannot connect to database"**
- Run: `docker ps | grep pr-analysis-db`
- If not running: `docker-compose up -d`

**"GitHub API rate limit"**
- Ensure GITHUB_TOKEN is set in backend/.env
- Token must have `repo` scope

**"OpenAI API error"**
- Ensure OPENAI_API_KEY is valid in backend/.env
- Check you have API credits

**Port already in use**
- Backend (3000): Stop other processes using port 3000
- Frontend (5173): Stop other Vite dev servers
- Database (5432): Stop other PostgreSQL instances

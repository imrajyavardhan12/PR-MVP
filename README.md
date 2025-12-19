# PR Analysis Tool - MVP

An internal proof-of-concept tool to analyze GitHub Pull Requests and generate structured reports using LLM.

## Architecture

- **Backend**: Bun.js + Hono
- **Frontend**: React + Vite + Tailwind CSS
- **Database**: PostgreSQL (Docker)
- **LLM**: OpenAI GPT-4

## Prerequisites

- [Bun](https://bun.sh) installed (v1.0+)
- [Docker](https://docker.com) installed
- GitHub Classic Personal Access Token with `repo` scope
- OpenAI API Key

## Setup

### 1. Start PostgreSQL Database

```bash
docker-compose up -d
```

This will start PostgreSQL on `localhost:5432` with:
- Database: `pr_analysis`
- User: `postgres`
- Password: `postgres`

### 2. Configure Backend

```bash
cd backend
cp .env.example .env
```

Edit `.env` and add your tokens:

```env
GITHUB_TOKEN=your_github_classic_token_here
OPENAI_API_KEY=your_openai_api_key_here
```

### 3. Install Backend Dependencies

```bash
cd backend
bun install
```

### 4. Start Backend Server

```bash
cd backend
bun run dev
```

The backend will run on `http://localhost:3000`

### 5. Install Frontend Dependencies

```bash
cd frontend
bun install
```

### 6. Start Frontend

```bash
cd frontend
bun run dev
```

The frontend will run on `http://localhost:5173`

## Usage

1. Open the dashboard at `http://localhost:5173`
2. Enter a PR in the format: `org/repo#pr_number` (e.g., `facebook/react#12345`)
3. Click "Generate Report"
4. The tool will:
   - Fetch PR data from GitHub
   - Store it in the database
   - Generate an LLM analysis
   - Display the report

### Subsequent Requests

If you request the same PR again, the cached report will be returned instantly.

## API Endpoints

### Generate/Fetch PR Report
```bash
POST http://localhost:3000/api/pr/report
Content-Type: application/json

{
  "org": "facebook",
  "repo": "react",
  "pr_number": 12345
}
```

### Get Existing Report
```bash
GET http://localhost:3000/api/pr/report/:org/:repo/:pr_number
```

## Features

- ✅ Fetch PR data (title, description, comments, reviews)
- ✅ Store raw data in PostgreSQL
- ✅ Generate LLM-powered analysis reports
- ✅ Smart caching (avoid redundant LLM calls)
- ✅ Simple dashboard UI
- ✅ Multi-repository support

## Database Schema

- `pull_requests` - PR metadata and raw data
- `pr_comments` - PR comments
- `pr_reviews` - PR reviews (approvals, change requests, comments)
- `pr_reports` - Generated LLM reports

## LLM Report Structure

Reports include:
1. **Summary** - Brief overview
2. **What Went Well** - Positive aspects
3. **Key Review Themes** - Main discussion topics
4. **Areas of Improvement** - Constructive feedback
5. **Key Learnings** - Insights for future PRs

## Troubleshooting

### Database Connection Issues

Ensure PostgreSQL is running:
```bash
docker ps | grep pr-analysis-db
```

### GitHub API Rate Limits

The tool uses unauthenticated or token-based requests. Ensure your GitHub token is valid.

### LLM Token Costs

Large PRs with many comments may consume significant tokens. Consider implementing token limits if needed.

## Future Enhancements

- [ ] GitHub App + Webhooks
- [ ] Team-level analytics
- [ ] Sprint reports
- [ ] Metric computation
- [ ] Report regeneration button
- [ ] Data retention policies

## License

Internal use only - Not for production deployment.

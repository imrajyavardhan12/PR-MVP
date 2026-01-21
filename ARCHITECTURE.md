# PR Analysis Tool - Technical Architecture

Complete technical documentation explaining how the system works from user input to AI-generated reports.

---

## 🏗️ Overall Architecture

```
User Input (Frontend)
    ↓
Backend API (Bun.js + Hono)
    ↓
├─→ GitHub API (Fetch PR Data)
├─→ PostgreSQL (Store Raw Data)
├─→ OpenAI API (Generate Report)
└─→ PostgreSQL (Store Report)
    ↓
Frontend (Display Result)
```

---

## 📊 Database Schema & Storage

The system uses **4 PostgreSQL tables** working together:

### 1. `pull_requests` (Main table)
```sql
- id (auto-increment primary key)
- org, repo, pr_number (unique combination)
- title, description, author, state
- created_at, updated_at
- raw_data (JSONB - stores complete GitHub API response)
```
**Purpose**: Master record for each PR. The `raw_data` field stores the entire GitHub API response as JSON for future reference.

### 2. `pr_comments` (Linked to PR)
```sql
- id (auto-increment)
- pr_id (foreign key → pull_requests.id)
- comment_id (unique GitHub comment ID)
- author, body, created_at
- raw_data (JSONB)
```
**Purpose**: Stores all comments from the PR discussion thread.

### 3. `pr_reviews` (Linked to PR)
```sql
- id (auto-increment)
- pr_id (foreign key → pull_requests.id)
- review_id (unique GitHub review ID)
- author, state (APPROVED/CHANGES_REQUESTED/COMMENTED)
- body, submitted_at
- raw_data (JSONB)
```
**Purpose**: Stores formal code reviews with their approval status.

### 4. `pr_reports` (Linked to PR)
```sql
- id (auto-increment)
- pr_id (foreign key → pull_requests.id, UNIQUE)
- report_content (TEXT - AI-generated markdown)
- generated_at (timestamp)
```
**Purpose**: Stores the AI-generated analysis report. One report per PR.

**Key Design Choice**: Using `UNIQUE` constraints on `(org, repo, pr_number)` and `pr_id` enables smart caching - prevents duplicate data and redundant AI calls.

---

## 🔄 Complete Flow: Step-by-Step

### Step 1: User Input (Frontend)

User enters: `facebook/react#31479` or full GitHub URL

**Frontend parsing logic** (`App.tsx`):
```javascript
// Handles multiple formats:
// 1. github.com/owner/repo/pull/123
// 2. github.com/owner/repo/123  
// 3. github.com/owner/repo#123
// 4. owner/repo#123

// Extracts: org, repo, pr_number
```

Sends POST request to backend:
```json
{
  "org": "facebook",
  "repo": "react", 
  "pr_number": 31479
}
```

---

### Step 2: Check Cache (Backend)

**File**: `backend/src/routes/pr.routes.ts`

```typescript
// First, check if we already have this PR
const existingPR = await dbService.getPullRequest(org, repo, pr_number);

if (existingPR) {
  const existingReport = await dbService.getReport(existingPR.id!);
  if (existingReport) {
    // ✅ Cache hit! Return immediately
    return c.json({ 
      cached: true, 
      pr: existingPR, 
      report: existingReport 
    });
  }
}
```

**Why this matters**: 
- Saves money (no OpenAI API call)
- Instant response (no 5-10 second wait)
- Reduces GitHub API rate limit usage

---

### Step 3: Fetch from GitHub API

**File**: `backend/src/services/github.service.ts`

If no cache, fetch fresh data using **Octokit** (official GitHub SDK):

```typescript
// 3 parallel API calls to GitHub:

// 1. Get PR details
const prData = await octokit.pulls.get({
  owner: org,
  repo: repo,
  pull_number: prNumber
});
// Returns: title, description, author, state, timestamps, etc.

// 2. Get all comments
const commentsData = await octokit.issues.listComments({
  owner: org,
  repo: repo,
  issue_number: prNumber
});
// Returns: array of comment objects

// 3. Get all reviews  
const reviewsData = await octokit.pulls.listReviews({
  owner: org,
  repo: repo,
  pull_number: prNumber
});
// Returns: array of review objects with APPROVE/CHANGES_REQUESTED/COMMENT
```

**Authentication**: Uses your `GITHUB_TOKEN` from `.env` file (Classic Personal Access Token with `repo` scope).

---

### Step 4: Transform & Store in Database

**File**: `backend/src/services/database.service.ts`

The raw GitHub data is transformed into your database schema:

```typescript
// Transform PR
const prData = {
  org: "facebook",
  repo: "react",
  pr_number: 31479,
  title: "Fix: Memory leak in useEffect",
  description: "This PR fixes...",
  author: "gaearon",
  state: "merged",
  created_at: "2024-01-15T10:30:00Z",
  updated_at: "2024-01-16T14:20:00Z",
  raw_data: { /* entire GitHub API response */ }
};

// Save to pull_requests table
const prId = await dbService.savePullRequest(prData);
// Returns: auto-generated ID (e.g., 42)

// Transform and save comments
for (const comment of comments) {
  await dbService.saveComment({
    pr_id: 42,
    comment_id: 987654321, // GitHub's comment ID
    author: "dan_abramov",
    body: "LGTM! Great fix",
    created_at: "2024-01-15T11:00:00Z",
    raw_data: { /* full comment object */ }
  });
}

// Transform and save reviews
for (const review of reviews) {
  await dbService.saveReview({
    pr_id: 42,
    review_id: 123456789,
    author: "sebmarkbage", 
    state: "APPROVED",
    body: "Looks good to me",
    submitted_at: "2024-01-15T12:00:00Z",
    raw_data: { /* full review object */ }
  });
}
```

**Database queries use `postgres` library** with tagged template literals:
```typescript
await sql`
  INSERT INTO pull_requests (org, repo, pr_number, ...)
  VALUES (${org}, ${repo}, ${pr_number}, ...)
  ON CONFLICT (org, repo, pr_number) DO UPDATE ...
  RETURNING id
`;
```

**Smart handling**: `ON CONFLICT` clauses prevent duplicates and update existing records if PR is re-analyzed.

---

### Step 5: Generate AI Report (The Magic! 🪄)

**File**: `backend/src/services/openai.service.ts`

Now the AI comes in. Here's the complete process:

#### 5a. Build the Prompt

The system creates a structured prompt from all the data:

```typescript
const prompt = `
Analyze this Pull Request and generate a structured report.

## PR Details
Title: Fix: Memory leak in useEffect
Author: @gaearon
State: merged

Description:
This PR fixes a memory leak that occurs when...

## Reviews (3)

### Review 1 by @sebmarkbage
State: APPROVED
Comment: Great catch! This was causing issues in production.

### Review 2 by @sophiebits  
State: CHANGES_REQUESTED
Comment: Can you add a test case for this scenario?

### Review 3 by @sebmarkbage
State: APPROVED
Comment: Thanks for adding the test!

## Comments (8)

### Comment 1 by @dan_abramov
Nice find! Did you measure the performance impact?

### Comment 2 by @gaearon
Yes, here are the benchmarks...

[... all comments ...]

## Instructions
Generate a report with the following sections:
1. **Summary**: Brief overview of the PR
2. **What Went Well**: Positive aspects and approvals
3. **Key Review Themes**: Main topics discussed
4. **Areas of Improvement**: Constructive feedback
5. **Key Learnings**: Insights for future PRs

Keep it concise, factual, and process-focused.
`;
```

#### 5b. Send to OpenAI API

```typescript
const response = await openai.chat.completions.create({
  model: 'gpt-4o-mini',  // Fast, cost-effective model
  messages: [
    {
      role: 'system',
      content: `You are a technical code review analyst...
      
      IMPORTANT GUIDELINES:
      - Summarize facts from the PR discussion
      - Group feedback into clear themes  
      - Highlight key learnings
      - Focus on process and code patterns
      - DO NOT compare individuals or assign scores
      - DO NOT infer intent or judge performance
      - DO NOT rank or rate developers`
    },
    {
      role: 'user',
      content: prompt  // The structured data from above
    }
  ],
  temperature: 0.7,      // Balanced creativity
  max_tokens: 2000       // Limit response length
});
```

**Why GPT-4o-mini?**
- Cost-effective (~$0.15 per 1M input tokens)
- Fast response times (2-5 seconds)
- Good enough for summarization tasks
- Can upgrade to GPT-4 for better quality if needed

#### 5c. AI Generates Markdown Report

The AI returns structured markdown like:

```markdown
# Summary
This PR addresses a critical memory leak in the useEffect hook...

## What Went Well
- **Quick identification**: The author identified the root cause...
- **Thorough testing**: Comprehensive test coverage added...
- **Team collaboration**: Multiple reviewers provided feedback...

## Key Review Themes  
- **Performance concerns**: Discussion about memory usage...
- **Test coverage**: Request for additional test cases...
- **Documentation**: Suggestions to update docs...

## Areas of Improvement
- Initial version lacked test cases
- Could benefit from performance benchmarks upfront

## Key Learnings
- Memory leaks in hooks require careful cleanup
- Performance testing should be part of the initial submission
```

---

### Step 6: Store AI Report

**File**: `backend/src/services/database.service.ts`

```typescript
await dbService.saveReport({
  pr_id: 42,  // Links to the PR record
  report_content: reportContent,  // The markdown from AI
  generated_at: new Date().toISOString()
});
```

Saved to `pr_reports` table. The `UNIQUE(pr_id)` constraint ensures one report per PR.

---

### Step 7: Return to Frontend

Backend sends response:

```json
{
  "message": "Report generated successfully",
  "cached": false,
  "pr": {
    "id": 42,
    "org": "facebook",
    "repo": "react", 
    "pr_number": 31479,
    "title": "Fix: Memory leak in useEffect",
    "author": "gaearon",
    "state": "merged",
    "created_at": "2024-01-15T10:30:00Z"
  },
  "report": {
    "id": 15,
    "pr_id": 42,
    "report_content": "# Summary\nThis PR addresses...",
    "generated_at": "2024-12-23T10:45:00Z"
  }
}
```

---

### Step 8: Beautiful Display (Frontend)

**File**: `frontend/src/App.tsx`

The React app receives the data and renders it beautifully:

#### PR Details Table
- Shows title, repo link, author, status badge, dates
- Links to GitHub for easy navigation
- Status color-coded (green=open, purple=merged, gray=closed)

#### Markdown Rendering
```typescript
<ReactMarkdown 
  remarkPlugins={[remarkGfm]}  // GitHub Flavored Markdown
  components={{
    code: CustomCodeBlock  // Syntax highlighting with Prism
  }}
>
  {result.report.report_content}
</ReactMarkdown>
```

This converts the AI's markdown into:
- Beautiful headings with borders
- Styled lists and paragraphs  
- Code blocks with syntax highlighting
- Tables, blockquotes, links, etc.

---

## 💰 Cost & Performance

### First Request (No Cache)
1. ⏱️ **0.5s** - Fetch from GitHub API (3 requests)
2. ⏱️ **0.2s** - Store in PostgreSQL (4 tables)
3. ⏱️ **3-5s** - OpenAI API call + response
4. ⏱️ **0.1s** - Store report in DB
5. ⏱️ **0.1s** - Return to frontend

**Total: ~4-6 seconds**  
**Cost: ~$0.01-0.05** (depending on PR size)

### Cached Request
1. ⏱️ **0.05s** - Database query to check existing report
2. ⏱️ **0.01s** - Return cached data

**Total: ~0.06 seconds**  
**Cost: $0** (no API calls!)

---

## 🔐 Security & Best Practices

### Environment Variables (`.env`)
```bash
GITHUB_TOKEN=ghp_xxxxxxxxxxxxx  # Read-only access
OPENAI_API_KEY=sk-xxxxxxxxxxxxx
DB_HOST=localhost
DB_PORT=5432
DB_NAME=pr_analysis
DB_USER=postgres  
DB_PASSWORD=postgres
```

**Never committed to git** - listed in `.gitignore`

### GitHub Token Permissions
- **Scope**: `repo` (read-only for public repos)
- **Risk**: Low (can't push code or modify repos)

### Database Security
- Foreign key constraints prevent orphaned data
- UNIQUE constraints prevent duplicates
- Cascading deletes (if PR deleted, comments/reviews auto-delete)

### AI Safety
- System prompt prevents harmful outputs
- No personal data sent (only public PR info)
- Content moderation built into OpenAI API

---

## 🚀 Key Innovations

1. **Smart Caching**: Saves 99% of cost on repeat requests
2. **JSONB Storage**: Keeps raw GitHub data for future analysis
3. **Relational Structure**: Normalized schema for efficient queries
4. **LLM-First Design**: AI does the heavy lifting (no hardcoded rules)
5. **Markdown Output**: Beautiful, readable, shareable reports

---

## 🎯 PRD Compliance

✅ Fetch PR data using GitHub API  
✅ Store raw data in PostgreSQL  
✅ Generate LLM report (5 sections)  
✅ Display via simple dashboard  
✅ No individual performance comparisons  
✅ Process-focused insights  
✅ Caching for efficiency  
✅ Multi-repo support  

---

## 📁 Project Structure

```
PR-MVP/
├── backend/
│   ├── src/
│   │   ├── db/
│   │   │   ├── connection.ts      # PostgreSQL connection
│   │   │   └── schema.sql         # Database schema
│   │   ├── routes/
│   │   │   └── pr.routes.ts       # API endpoints
│   │   ├── services/
│   │   │   ├── database.service.ts    # Database operations
│   │   │   ├── github.service.ts      # GitHub API integration
│   │   │   └── openai.service.ts      # OpenAI API integration
│   │   ├── types/
│   │   │   └── index.ts           # TypeScript types
│   │   └── index.ts               # Server entry point
│   ├── .env                       # Environment variables (not in git)
│   ├── .env.example               # Template for .env
│   ├── package.json               # Dependencies
│   └── tsconfig.json              # TypeScript config
│
├── frontend/
│   ├── src/
│   │   ├── App.tsx                # Main React component
│   │   ├── App.css                # Styles
│   │   ├── main.tsx               # Entry point
│   │   └── index.css              # Global styles
│   ├── package.json               # Dependencies
│   ├── vite.config.ts             # Vite config
│   └── tailwind.config.js         # Tailwind CSS config
│
├── docker-compose.yml             # PostgreSQL container (optional)
├── PRD.md                         # Product requirements
├── README.md                      # User documentation
├── QUICKSTART.md                  # Quick setup guide
└── ARCHITECTURE.md                # This file
```

---

## 🔧 Tech Stack

### Backend
- **Runtime**: Bun.js (fast JavaScript runtime)
- **Framework**: Hono (lightweight web framework)
- **Database**: PostgreSQL + `postgres` library
- **GitHub**: Octokit (@octokit/rest)
- **AI**: OpenAI SDK (openai)

### Frontend
- **Framework**: React 19
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **Markdown**: react-markdown + remark-gfm
- **Syntax Highlighting**: react-syntax-highlighter

### Infrastructure
- **Database**: Postgres.app (local) or Docker
- **Network**: CORS-enabled for local development

---

## 📝 API Reference

### POST `/api/pr/report`
Generate or retrieve a PR analysis report.

**Request:**
```json
{
  "org": "facebook",
  "repo": "react",
  "pr_number": 31479
}
```

**Response:**
```json
{
  "message": "Report generated successfully",
  "cached": false,
  "pr": { /* PR details */ },
  "report": { /* AI report */ }
}
```

### GET `/api/pr/report/:org/:repo/:pr_number`
Get an existing report for a specific PR.

**Response:**
```json
{
  "pr": { /* PR details */ },
  "report": { /* AI report */ },
  "comments": [ /* array of comments */ ],
  "reviews": [ /* array of reviews */ ]
}
```

---

## 🎨 Frontend Features

### Input Flexibility
Accepts multiple PR format inputs:
- `facebook/react#31479`
- `https://github.com/facebook/react/pull/31479`
- `github.com/facebook/react/pull/31479`
- `github.com/facebook/react/31479`

### UI Components
- **Header**: Branding and description
- **Search Form**: PR input with validation
- **PR Details Table**: Structured metadata display
- **Report Section**: Markdown-rendered AI analysis
- **Footer**: Credits

### Visual Design
- **Color Scheme**: Slate-based professional theme
- **Typography**: System fonts with proper hierarchy
- **Status Badges**: Color-coded PR states
- **Loading States**: Spinner animation during generation
- **Empty State**: Placeholder when no results

---

## 🐛 Error Handling

### Frontend
- Input validation (format checking)
- Network error handling
- User-friendly error messages
- Loading states prevent duplicate requests

### Backend
- Try-catch blocks on all async operations
- Detailed error logging to console
- HTTP status codes (400, 404, 500)
- Graceful degradation on API failures

### Database
- Connection retry logic
- Foreign key constraints
- Transaction support for atomicity
- ON CONFLICT handling for duplicates

---

## 🔮 Future Enhancements

### Short-term
- [ ] Report regeneration button
- [ ] Multiple PR batch analysis
- [ ] Export reports to PDF/Markdown
- [ ] Dark mode toggle

### Medium-term
- [ ] Team-level analytics dashboard
- [ ] Sprint/milestone reports
- [ ] Custom report templates
- [ ] Webhook integration

### Long-term
- [ ] GitHub App (auto-trigger on PR events)
- [ ] Machine learning for pattern detection
- [ ] Integration with Jira/Linear
- [ ] Multi-repository comparisons
- [ ] Historical trend analysis

---

## 📊 Database Relationships

```
pull_requests (1) ─── (many) pr_comments
     │
     ├─── (many) pr_reviews
     │
     └─── (1) pr_reports
```

All relationships use foreign keys with CASCADE delete:
- Deleting a PR automatically removes all related comments, reviews, and reports
- Maintains referential integrity
- Prevents orphaned records

---

## 🧪 Testing Recommendations

### Manual Testing
1. Test with public PRs from popular repos
2. Try various PR sizes (small, medium, large)
3. Test caching (same PR twice)
4. Test different input formats
5. Check error handling (invalid PR numbers)

### Automated Testing (Future)
- Unit tests for services
- Integration tests for API endpoints
- E2E tests for frontend flows
- Database migration tests
- Mock GitHub/OpenAI APIs

---

## 📈 Monitoring & Observability

### Current Logging
- Console logs for key operations
- Database query logging (if enabled)
- Error stack traces

### Recommended Additions
- Request/response logging
- Performance metrics (response times)
- Cost tracking (OpenAI API usage)
- GitHub API rate limit monitoring
- Database query performance

---

## 🎓 Learning Resources

### Technologies Used
- [Bun.sh Documentation](https://bun.sh/docs)
- [Hono Framework](https://hono.dev)
- [Octokit/GitHub API](https://octokit.github.io/rest.js/)
- [OpenAI API](https://platform.openai.com/docs)
- [PostgreSQL](https://www.postgresql.org/docs/)
- [React Documentation](https://react.dev)
- [Tailwind CSS](https://tailwindcss.com)

### Key Concepts
- REST API design
- Database normalization
- LLM prompt engineering
- Caching strategies
- React state management
- Markdown rendering

---

**Created by**: Rajyavardhan  
**Last Updated**: 2024-12-23  
**Version**: 1.0

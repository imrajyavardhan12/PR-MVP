# Product Requirements Document (PRD)
## PR Analysis Tool – MVP

---

## 1. Overview

### Product Name
PR Analysis Tool (MVP)

### Purpose
The PR Analysis Tool MVP is an internal proof-of-concept designed to analyze GitHub Pull Requests and generate a structured PR-level report using an LLM. The goal is to demonstrate feasibility and value before investing in a production-grade solution.

This tool focuses on **process and code review insights**, not individual performance evaluation.

---

## 2. Problem Statement

Currently, valuable information in PR discussions (reviews, comments, feedback patterns) is scattered and difficult to summarize. Teams lack an easy way to:

- Understand review feedback holistically
- Capture learnings from PR discussions
- Quickly review what went well and what could improve

The MVP aims to solve this by generating a concise PR-level report from existing PR data.

---

## 3. Goals & Success Criteria

### Goals
- Fetch PR data using GitHub APIs
- Store PR data reliably
- Generate a meaningful PR report using an LLM
- Display the report via a simple dashboard

### Success Criteria
- A user can enter a PR number and view a generated report
- Report summarizes PR feedback clearly and accurately
- End-to-end flow works without manual intervention

---

## 4. Non-Goals (Out of Scope)

- GitHub App integration
- Webhooks
- Team-level or sprint-level analytics
- Employee comparison or ranking
- HR or performance evaluation
- Production-grade security and compliance

---

## 5. Target Users

- Internal engineers
- Engineering managers (demo/review only)
- Product/tech leadership (concept validation)

---

## 6. Functional Requirements

### 6.1 PR Data Ingestion
- Fetch PR data using a **Classic GitHub Token**
- Supported data:
  - PR title and description
  - PR author
  - Comments
  - Reviews (approve / change request / comment)

### 6.2 Data Storage
- Store raw PR data in a PostgreSQL database
- Store PRs uniquely by repository + PR number
- Store generated reports separately

### 6.3 Report Generation (LLM)
- Backend sends structured PR data to an LLM
- LLM generates a PR-level report covering:
  - What went well
  - Key review themes
  - Areas of improvement
  - General learnings
- No hardcoded analysis rules

### 6.4 Dashboard
- Simple web UI
- Input field to search by PR number
- Display:
  - PR metadata
  - Generated PR report

---

## 7. Non-Functional Requirements

### Performance
- Report generation can be asynchronous
- Acceptable latency: a few seconds per PR

### Reliability
- Safe retries for GitHub API calls
- Handle missing or partial PR data gracefully

### Security (MVP-Level)
- Read-only GitHub access
- Secrets stored as environment variables
- Internal access only

---

## 8. User Flow

1. User opens dashboard
2. User enters PR number
3. Backend:
   - Fetches PR data from GitHub
   - Stores raw data
   - Sends data to LLM
   - Stores generated report
4. Dashboard displays PR report

---

## 9. Technical Architecture

### Frontend
- React or Next.js
- Hosted on Vercel

### Backend
- Node.js (Express) or Python (FastAPI)
- REST APIs

### Database
- PostgreSQL

### LLM
- OpenAI API

---

## 10. API Requirements (High-Level)

### Fetch PR Data
POST /api/pr/fetch

shell
Copy code

### Generate PR Report
POST /api/pr/report

shell
Copy code

### Retrieve PR Report
GET /api/pr/report/{pr_number}

yaml
Copy code

---

## 11. Data Model (High-Level)

Entities:
- Pull Requests
- PR Comments
- PR Reviews
- PR Reports

All raw data stored in JSON format for flexibility.

---

## 12. LLM Guidelines

The LLM **must**:
- Summarize facts
- Group feedback themes
- Highlight learnings

The LLM **must not**:
- Compare individuals
- Assign scores or rankings
- Infer intent or performance

---

## 13. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Token security | Read-only token, limited scope |
| API rate limits | Small MVP usage |
| LLM hallucinations | Constrained prompts |
| Data inconsistency | Raw data preserved |

---

## 14. Future Enhancements (Post-MVP)

- GitHub App + Webhooks
- Employee filtering
- Team and sprint reports
- Metric computation before LLM
- Client-approvable security model

---

## 15. Open Questions

- Which LLM model to standardize on?
- Async vs sync report generation?
- Retention policy for stored PR data?

---

## 16. Summary

This MVP validates that:
- PR data can be ingested reliably
- LLMs can generate useful PR insights
- A dashboard-driven experience is valuable

The MVP is intentionally minimal to enable fast learning and iteration.
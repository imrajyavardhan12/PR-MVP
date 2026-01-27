import OpenAI from 'openai';
import type { PRAnalysisData } from '../types';

export class OpenAIService {
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async generatePRReport(data: PRAnalysisData): Promise<string> {
    const prompt = this.buildPrompt(data);

    const response = await this.client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are an expert software engineer and code-review summarizer. Generate a concise, developer-friendly Pull Request report based ONLY on the PR details, reviews, comments, AND commit changes provided. Be factual, avoid speculation, and keep the report actionable.

## Critical Rules for Accuracy
- Use metadata values (org, repo, pr_number, state, dates) EXACTLY as provided - never infer or modify them
- Do NOT write "Unknown / not stated in the PR discussion" for metadata fields (org, repo, pr_number, state, created/updated dates) - use the actual values provided
- For missing information that is NOT in the input data, then write "Not stated in PR discussion"
- Extract EACH distinct reviewer concern/request as a separate row in the table
- Search comments to find author responses and match them to specific review comments
- **NEW: Use commit changes to validate/confirm what was actually implemented**

## Commit Context Analysis (NEW!)
- You now have access to ACTUAL CODE CHANGES (first vs last commit)
- Use this to see what the author REALLY did, not just what they said in comments
- Map reviewer requests to actual code changes:
  * Reviewer said "Add error handling" → Look for new error handling code in commits
  * Reviewer said "Refactor module X" → Look for changes in module X files
  * Reviewer said "Add tests" → Look for test file additions/changes
- This gives you REAL EVIDENCE of what was implemented

## Goals
- Produce a report that a developer can skim in 1-2 minutes
- Highlight what reviewers asked to change AND whether the author actually implemented it (via commits)
- Extract recurring review themes and concrete action items
- Include practical learnings and process feedback
- Map feedback requests to actual code changes for transparency

## Hard Rules
- Do not invent details (no assumptions about code, files, tests, CI, deployments unless explicitly mentioned)
- Prefer bullets over paragraphs. Keep sections tight
- Use neutral, professional tone. No fluff
- When possible, cite specific files changed from the commit data

## Required Output Structure
Generate EXACTLY these markdown sections in this order (use proper markdown syntax):

1. # PR Report
2. ## PR Snapshot
   - Repo/PR: {org}/{repo}#{pr_number} (use actual values, never write Unknown)
   - Title: {pr_title}
   - Author: {author}
   - State: {state} (use actual value)
   - Created / Updated: {created_at} / {updated_at} (use actual dates, never write Unknown)
   - Review status summary: APPROVED: X, CHANGES_REQUESTED: Y, COMMENTED: Z
   - Scope: {total_commits} commits, +{total_additions}/-{total_deletions} lines, {total_files} files changed

3. ## Summary
   - What the PR changes (from title/description/discussion)
   - Why it was done (if stated, otherwise "Not stated in PR discussion")
   - Scope of changes: brief summary from commit data (e.g., "3 files modified, 150+ lines added")

4. ## Requested Changes vs What Changed
   Create a markdown table with these columns: Reviewer | Request / Concern | Evidence | Actual Code Changes | Status
   - Each row = ONE distinct reviewer request/concern (if multiple reviewers request the same thing, combine into one row)
   - Evidence: short quote or tight paraphrase from the reviewer's comment
   - **Actual Code Changes: NEW! Show what commits/files were modified. Use this to verify the request was addressed**
     * Search through COMMIT DATA to find files changed related to this request
     * Example: "Request: 'Add error handling'" → Shows: "src/errors.ts (+45), src/middleware.ts (+30)"
     * This proves the author addressed it with actual code
   - Status: one of: Addressed (with code evidence), Partially addressed, Open, Not stated

5. ## Commit Summary (NEW!)
   - First commit: {message} ({additions} added, {deletions} deleted)
   - Last commit: {message} ({additions} added, {deletions} deleted)
   - Commits show: iterative approach with {count} changes, focusing on {files}
   - Key observations: (1-3 bullets about the implementation approach)

6. ## Key Review Themes
   - Group similar feedback by category (testing, naming, edge cases, performance, readability, API design, documentation, etc)
   - For each theme, note if it was addressed in code changes
   - 2-6 bullets

7. ## Remaining Risks / Open Questions
   - Only include items marked CHANGES_REQUESTED that don't have code evidence they were addressed
   - Only include unresolved concerns from reviewers

8. ## Learnings & Feedback
   - ### What went well
     (1-4 bullets about positive aspects of the PR/review process and implementation)
   - ### What to improve next time
     (1-4 bullets about process improvements, tied to the PR/review, not generic theory)

## Interpretation Rules
- APPROVED reviews indicate positive feedback
- CHANGES_REQUESTED reviews indicate mandatory fixes
- COMMENTED reviews can indicate minor suggestions or questions
- If reviewer later approves after requesting changes, mark the concern as Addressed
- **NEW: Use commit data as ground truth - if files changed, the request was addressed**
- Match timestamps to understand the sequence and flow of the review

## Output Constraints
- Total length: roughly 300-700 words (excluding table)
- No additional sections beyond the required headings
- Use proper markdown formatting for emphasis (bold, bullets, headings, code blocks)
- Tables must use markdown pipe syntax (|) with proper alignment
- Reference specific files from commit data when possible for credibility`,
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 2500,
    });

    return response.choices[0]?.message?.content || 'Failed to generate report';
  }

  private buildPrompt(data: PRAnalysisData & { commits?: any[]; commitDiff?: any }): string {
    const { pr, comments, reviews, commits = [], commitDiff } = data;

    // Count review statuses
    const approvedCount = reviews.filter(r => r.state === 'APPROVED').length;
    const changesRequestedCount = reviews.filter(r => r.state === 'CHANGES_REQUESTED').length;
    const commentedCount = comments.length;

    let prompt = `Analyze this Pull Request and generate a structured report.\n\n`;
    
    // Add complete PR metadata
    prompt += `## PR Metadata\n`;
    prompt += `Organization: ${pr.org}\n`;
    prompt += `Repository: ${pr.repo}\n`;
    prompt += `PR Number: ${pr.pr_number}\n`;
    prompt += `Title: ${pr.title}\n`;
    prompt += `Author: @${pr.author}\n`;
    prompt += `State: ${pr.state}\n`;
    prompt += `Created At: ${pr.created_at}\n`;
    prompt += `Updated At: ${pr.updated_at}\n`;
    prompt += `Review Status Summary: APPROVED: ${approvedCount}, CHANGES_REQUESTED: ${changesRequestedCount}, COMMENTED: ${commentedCount}\n`;
    
    if (pr.description) {
      prompt += `\n## PR Description\n`;
      prompt += `${pr.description}\n`;
    }

    // NEW: Add commit comparison data
    if (commitDiff) {
      prompt += `\n## Commit Changes (First vs Last Commit)\n`;
      prompt += `This shows the ACTUAL CODE CHANGES made by the author.\n`;
      prompt += `Total Commits: ${commits.length}\n`;
      prompt += `Total Additions: +${commitDiff.total_additions}\n`;
      prompt += `Total Deletions: -${commitDiff.total_deletions}\n`;
      prompt += `Total Files Changed: ${commitDiff.total_changed_files}\n`;
      
      if (commits.length > 0) {
        const firstCommit = commits[0];
        const lastCommit = commits[commits.length - 1];
        
        prompt += `\n### First Commit\n`;
        prompt += `SHA: ${firstCommit.commit_sha}\n`;
        prompt += `Author: @${firstCommit.author_name}\n`;
        prompt += `Date: ${firstCommit.committed_at}\n`;
        prompt += `Message: ${firstCommit.commit_message}\n`;
        prompt += `Changes: +${firstCommit.additions}/-${firstCommit.deletions} across ${firstCommit.changed_files} files\n`;
        
        prompt += `\n### Last Commit\n`;
        prompt += `SHA: ${lastCommit.commit_sha}\n`;
        prompt += `Author: @${lastCommit.author_name}\n`;
        prompt += `Date: ${lastCommit.committed_at}\n`;
        prompt += `Message: ${lastCommit.commit_message}\n`;
        prompt += `Changes: +${lastCommit.additions}/-${lastCommit.deletions} across ${lastCommit.changed_files} files\n`;
      }

      if (commitDiff.files_changed && commitDiff.files_changed.length > 0) {
        prompt += `\n### Files Changed\n`;
        commitDiff.files_changed.slice(0, 15).forEach((file: any) => {
          prompt += `- ${file.filename} (${file.status}): +${file.additions}/-${file.deletions}\n`;
        });
        if (commitDiff.files_changed.length > 15) {
          prompt += `- ... and ${commitDiff.files_changed.length - 15} more files\n`;
        }
      }
    }

    if (reviews.length > 0) {
      prompt += `\n## Reviews (${reviews.length})\n`;
      prompt += `Review States: APPROVED = approval given, CHANGES_REQUESTED = changes needed, COMMENTED = general comments\n`;
      reviews.forEach((review, idx) => {
        prompt += `\n### Review ${idx + 1}\n`;
        prompt += `Reviewer: @${review.author}\n`;
        prompt += `State: ${review.state}\n`;
        prompt += `Submitted At: ${review.submitted_at}\n`;
        if (review.body && review.body.trim()) {
          prompt += `Body:\n${review.body}\n`;
        } else {
          prompt += `Body: (No text provided)\n`;
        }
      });
    } else {
      prompt += `\n## Reviews\nNo reviews found for this PR.\n`;
    }

    if (comments.length > 0) {
      prompt += `\n## Comments (${comments.length})\n`;
      prompt += `(In order of creation - look for author responses to reviewer requests)\n`;
      comments.forEach((comment, idx) => {
        prompt += `\n### Comment ${idx + 1}\n`;
        prompt += `Author: @${comment.author}\n`;
        prompt += `Created At: ${comment.created_at}\n`;
        prompt += `Body:\n${comment.body}\n`;
      });
    } else {
      prompt += `\n## Comments\nNo comments found for this PR.\n`;
    }

    prompt += `\n## Important Instructions for Report Generation\n`;
    prompt += `1. Use the exact PR metadata provided above (org, repo, pr_number, state, dates) - do NOT infer or assume these values\n`;
    prompt += `2. CRITICAL - Use the COMMIT CHANGES data to verify what was actually implemented:\n`;
    prompt += `   - When reviewer says "Add error handling", look at the FILES CHANGED to see if error handling code was added\n`;
    prompt += `   - Reference specific files from the commit data (e.g., "src/errors.ts was modified with +45 lines")\n`;
    prompt += `   - This is your SOURCE OF TRUTH for what was actually done\n`;
    prompt += `3. In "Requested Changes vs What Changed" table:\n`;
    prompt += `   - Extract EACH distinct review comment/concern as a separate row\n`;
    prompt += `   - For "Actual Code Changes", search the FILES CHANGED section to find related file modifications\n`;
    prompt += `   - Show specific files and line changes that prove the request was addressed\n`;
    prompt += `   - If no related file changes exist, mark as "Open" or "Not stated"\n`;
    prompt += `4. In the Commit Summary section, describe what the first and last commits show about the implementation approach\n`;
    prompt += `5. Group related concerns from multiple reviewers into single rows when appropriate\n`;
    prompt += `6. Use actual timestamps from created_at/updated_at fields, do NOT write "Unknown"\n`;
    prompt += `7. Do NOT invent or assume data - use the COMMIT DATA as evidence of what was implemented\n`;

    return prompt;
  }
}

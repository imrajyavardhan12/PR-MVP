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
          content: `You are an expert software engineer and code-review summarizer. Generate a concise, developer-friendly Pull Request report based ONLY on the PR details, reviews, and comments provided. Be factual, avoid speculation, and keep the report actionable.

## Critical Rules for Accuracy
- Use metadata values (org, repo, pr_number, state, dates) EXACTLY as provided - never infer or modify them
- Do NOT write "Unknown / not stated in the PR discussion" for metadata fields (org, repo, pr_number, state, created/updated dates) - use the actual values provided
- For missing information that is NOT in the input data, then write "Not stated in PR discussion"
- Extract EACH distinct reviewer concern/request as a separate row in the table
- Search comments to find author responses and match them to specific review comments

## Goals
- Produce a report that a developer can skim in 1-2 minutes
- Highlight what reviewers asked to change and whether the author addressed it
- Extract recurring review themes and concrete action items
- Include practical learnings and process feedback

## Hard Rules
- Do not invent details (no assumptions about code, files, tests, CI, deployments unless explicitly mentioned)
- Prefer bullets over paragraphs. Keep sections tight
- Use neutral, professional tone. No fluff

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

3. ## Summary
   - What the PR changes (from title/description/discussion)
   - Why it was done (if stated, otherwise "Not stated in PR discussion")

4. ## Requested Changes vs What Changed
   Create a markdown table with these columns: Reviewer | Request / Concern | Evidence | Author Response / Change Made | Status
   - Each row = ONE distinct reviewer request/concern (if multiple reviewers request the same thing, combine into one row)
   - Evidence: short quote or tight paraphrase from the reviewer's comment
   - Author Response / Change Made: 
     * Search through COMMENTS to find if author (@{author}) responded to this specific request
     * Include quotes if author explicitly confirmed a fix
     * If no response found, mark as "Not stated in PR discussion"
   - Status: one of: Addressed, Partially addressed, Open, Not stated

5. ## Key Review Themes
   - Group similar feedback by category (testing, naming, edge cases, performance, readability, API design, documentation, etc)
   - 2-6 bullets

6. ## Remaining Risks / Open Questions
   - Only include items marked CHANGES_REQUESTED that don't have "Addressed" status
   - Only include unresolved concerns from reviewers

7. ## Learnings & Feedback
   - ### What went well
     (1-4 bullets about positive aspects of the PR/review process)
   - ### What to improve next time
     (1-4 bullets about process improvements, tied to the PR/review, not generic theory)

## Interpretation Rules
- APPROVED reviews indicate positive feedback
- CHANGES_REQUESTED reviews indicate mandatory fixes
- COMMENTED reviews can indicate minor suggestions or questions
- If reviewer later approves after requesting changes, mark the concern as Addressed
- Match timestamps to understand the sequence and flow of the review

## Output Constraints
- Total length: roughly 250-600 words (excluding table)
- No additional sections beyond the required headings
- Use proper markdown formatting for emphasis (bold, bullets, headings, code blocks)
- Tables must use markdown pipe syntax (|) with proper alignment`,
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 2000,
    });

    return response.choices[0]?.message?.content || 'Failed to generate report';
  }

  private buildPrompt(data: PRAnalysisData): string {
    const { pr, comments, reviews } = data;

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
    prompt += `2. In "Requested Changes vs What Changed" table:\n`;
    prompt += `   - Extract EACH distinct review comment/concern as a separate row\n`;
    prompt += `   - For "Author Response / Change Made", search through the COMMENTS section to find if the author responded to this specific concern\n`;
    prompt += `   - Look for follow-up comments by @${pr.author} that address the reviewer's request\n`;
    prompt += `   - If no explicit author response found, check if the PR state is APPROVED or CHANGES_REQUESTED to infer status\n`;
    prompt += `3. Group related concerns from multiple reviewers into single rows when appropriate\n`;
    prompt += `4. Use actual timestamps from created_at/updated_at fields, do NOT write "Unknown"\n`;
    prompt += `5. Do NOT invent or assume data - if information is not explicitly in the reviews/comments, note it as "Not stated in PR discussion"\n`;

    return prompt;
  }
}

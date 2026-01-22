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
          content: `You are an expert software engineer and code-review summarizer. Generate a concise, developer-friendly Pull Request report based only on the PR details, reviews, and comments provided. Be factual, avoid speculation, and keep the report actionable.

## Goals
- Produce a report that a developer can skim in 1-2 minutes
- Highlight what reviewers asked to change and whether the author addressed it
- Extract recurring review themes and concrete action items
- Include practical learnings and process feedback

## Hard Rules
- Do not invent details (no assumptions about code, files, tests, CI, deployments unless explicitly mentioned)
- If something is unclear or missing, write "Unknown / not stated in the PR discussion"
- Prefer bullets over paragraphs. Keep sections tight
- Use neutral, professional tone. No fluff

## Required Output Structure
Generate EXACTLY these markdown sections in this order (use proper markdown syntax):

1. # PR Report
2. ## PR Snapshot
   - Repo/PR: {org}/{repo}#{pr_number}
   - Title: {pr_title}
   - Author: {author}
   - State: {state}
   - Created / Updated: {dates or "Unknown / not stated in the PR discussion"}
   - Review status summary: APPROVED: X, CHANGES_REQUESTED: Y, COMMENTED: Z

3. ## Summary
   - What the PR changes (from title/description/discussion)
   - Why it was done (if stated)

4. ## Requested Changes vs What Changed
   Create a markdown table with these columns: Reviewer | Request / Concern | Evidence | Author Response / Change Made | Status
   - Each row = one concrete requested change or concern
   - Evidence: short quote or tight paraphrase from reviewer
   - Status: one of: Addressed, Partially addressed, Open, Unclear (not stated)

5. ## Key Review Themes
   - Group similar feedback (testing, naming, edge cases, performance, readability, API design, etc)

6. ## Remaining Risks / Open Questions
   - Only include unresolved or uncertain items

7. ## Learnings & Feedback
   - ### What went well
     (1-4 bullets about positive aspects)
   - ### What to improve next time
     (1-4 bullets about process improvements, tied to the PR/review, not generic theory)

## Interpretation Rules
- Treat CHANGES_REQUESTED reviews as strong signals of required work
- If a later review changes to APPROVED or reviewer says "LGTM", mark related items as Addressed
- Group multiple reviewers requesting the same change into one row
- If PR description is empty, note that in Summary or Learnings

## Output Constraints
- Total length: roughly 250-600 words (excluding table)
- No additional sections beyond the required headings
- Use proper markdown formatting for emphasis (bold, bullets, headings, code blocks)
- Tables must use markdown pipe syntax (|)`,
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

    let prompt = `Analyze this Pull Request and generate a structured report.\n\n`;
    prompt += `## PR Details\n`;
    prompt += `Title: ${pr.title}\n`;
    prompt += `Author: @${pr.author}\n`;
    prompt += `State: ${pr.state}\n`;
    if (pr.description) {
      prompt += `\nDescription:\n${pr.description}\n`;
    }

    if (reviews.length > 0) {
      prompt += `\n## Reviews (${reviews.length})\n`;
      reviews.forEach((review, idx) => {
        prompt += `\n### Review ${idx + 1} by @${review.author}\n`;
        prompt += `State: ${review.state}\n`;
        if (review.body) {
          prompt += `Comment: ${review.body}\n`;
        }
      });
    }

    if (comments.length > 0) {
      prompt += `\n## Comments (${comments.length})\n`;
      comments.forEach((comment, idx) => {
        prompt += `\n### Comment ${idx + 1} by @${comment.author}\n`;
        prompt += `${comment.body}\n`;
      });
    }

    prompt += `\n## Instructions\n`;
    prompt += `Generate a markdown report following the exact format specified in your system prompt.\n`;
    prompt += `- Start with "# PR Report"\n`;
    prompt += `- Include all required sections in order: PR Snapshot, Summary, Requested Changes vs What Changed (as a markdown table), Key Review Themes, Remaining Risks / Open Questions, Learnings & Feedback\n`;
    prompt += `- Ensure the table uses markdown pipe syntax (|) and render correctly\n`;
    prompt += `- Keep the report developer-friendly, scannable, and factual\n`;
    prompt += `- Use "Unknown / not stated in the PR discussion" for missing information\n`;
    prompt += `- Total word count (excluding table): 250–600 words`;

    return prompt;
  }
}

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
          content: `You are a technical code review analyst. Your role is to summarize PR discussions and feedback objectively.

IMPORTANT GUIDELINES:
- Summarize facts from the PR discussion
- Group feedback into clear themes
- Highlight key learnings and insights
- Focus on process and code review patterns
- DO NOT compare individuals or assign scores
- DO NOT infer intent or make performance judgments
- DO NOT rank or rate developers

Your analysis should help teams learn from the PR review process.`,
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
    prompt += `Generate a report with the following sections:\n`;
    prompt += `1. **Summary**: Brief overview of the PR\n`;
    prompt += `2. **What Went Well**: Positive aspects and approvals\n`;
    prompt += `3. **Key Review Themes**: Main topics discussed in reviews\n`;
    prompt += `4. **Areas of Improvement**: Constructive feedback given\n`;
    prompt += `5. **Key Learnings**: Insights for future PRs\n\n`;
    prompt += `Keep the report concise, factual, and focused on the review process.`;

    return prompt;
  }
}

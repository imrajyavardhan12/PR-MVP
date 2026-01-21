import type { PullRequest, PRReport, PRComment, PRReview } from '../types';

export type ExportFormat = 'markdown' | 'json' | 'html' | 'pdf';

export class ExportService {
  generateMarkdown(
    pr: PullRequest,
    report: PRReport,
    comments?: PRComment[],
    reviews?: PRReview[]
  ): string {
    let markdown = '';

    // Header
    markdown += `# PR Analysis Report\n\n`;
    markdown += `**Repository:** ${pr.org}/${pr.repo}\n`;
    markdown += `**PR Number:** #${pr.pr_number}\n`;
    markdown += `**Author:** @${pr.author}\n`;
    markdown += `**State:** ${pr.state}\n`;
    markdown += `**Created:** ${new Date(pr.created_at).toLocaleString()}\n\n`;

    // PR Details
    markdown += `## Pull Request Details\n\n`;
    markdown += `**Title:** ${pr.title}\n\n`;
    if (pr.description) {
      markdown += `**Description:**\n${pr.description}\n\n`;
    }

    // AI Report
    markdown += `## AI Analysis Report\n\n`;
    markdown += `${report.report_content}\n\n`;

    // Comments section
    if (comments && comments.length > 0) {
      markdown += `## Comments (${comments.length})\n\n`;
      comments.forEach((comment, idx) => {
        markdown += `### Comment ${idx + 1} by @${comment.author}\n`;
        markdown += `${comment.body}\n\n`;
      });
    }

    // Reviews section
    if (reviews && reviews.length > 0) {
      markdown += `## Reviews (${reviews.length})\n\n`;
      reviews.forEach((review, idx) => {
        markdown += `### Review ${idx + 1} by @${review.author}\n`;
        markdown += `**State:** ${review.state}\n`;
        if (review.body) {
          markdown += `**Comment:** ${review.body}\n`;
        }
        markdown += `\n`;
      });
    }

    // Footer
    markdown += `---\n`;
    markdown += `*Report generated on ${new Date().toLocaleString()}*\n`;

    return markdown;
  }

  generateJSON(
    pr: PullRequest,
    report: PRReport,
    comments?: PRComment[],
    reviews?: PRReview[]
  ): string {
    const data = {
      metadata: {
        generatedAt: new Date().toISOString(),
        version: '1.0',
      },
      pullRequest: {
        org: pr.org,
        repo: pr.repo,
        number: pr.pr_number,
        title: pr.title,
        description: pr.description,
        author: pr.author,
        state: pr.state,
        createdAt: pr.created_at,
        updatedAt: pr.updated_at,
      },
      report: {
        content: report.report_content,
        generatedAt: report.generated_at,
      },
      comments: comments || [],
      reviews: reviews || [],
    };

    return JSON.stringify(data, null, 2);
  }

  generateHTML(
    pr: PullRequest,
    report: PRReport,
    comments?: PRComment[],
    reviews?: PRReview[]
  ): string {
    const escapeHtml = (text: string) => {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    };

    const formatDate = (date: string) => new Date(date).toLocaleString();

    let html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>PR Analysis Report - ${pr.org}/${pr.repo}#${pr.pr_number}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            background: #f5f5f5;
        }
        .container {
            max-width: 900px;
            margin: 0 auto;
            padding: 40px 20px;
        }
        .header {
            background: white;
            padding: 30px;
            border-radius: 8px;
            margin-bottom: 30px;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }
        h1 {
            color: #1f2937;
            margin-bottom: 20px;
            font-size: 28px;
        }
        h2 {
            color: #374151;
            margin-top: 30px;
            margin-bottom: 15px;
            font-size: 22px;
            border-bottom: 2px solid #ddd;
            padding-bottom: 10px;
        }
        .pr-meta {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 15px;
            margin-bottom: 20px;
        }
        .meta-item {
            background: #f9fafb;
            padding: 12px;
            border-radius: 4px;
        }
        .meta-label {
            font-weight: 600;
            color: #6b7280;
            font-size: 12px;
            text-transform: uppercase;
        }
        .meta-value {
            color: #1f2937;
            margin-top: 5px;
            word-break: break-all;
        }
        .badge {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 600;
        }
        .badge-open {
            background: #d1fae5;
            color: #065f46;
        }
        .badge-closed {
            background: #e5e7eb;
            color: #374151;
        }
        .badge-merged {
            background: #ede9fe;
            color: #581c87;
        }
        .report-content {
            background: white;
            padding: 30px;
            border-radius: 8px;
            margin-bottom: 30px;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }
        .comment-section, .review-section {
            background: white;
            padding: 30px;
            border-radius: 8px;
            margin-bottom: 30px;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }
        .comment-item, .review-item {
            border-left: 4px solid #ddd;
            padding-left: 20px;
            margin-bottom: 20px;
            padding-bottom: 20px;
        }
        .comment-author {
            font-weight: 600;
            color: #1f2937;
            margin-bottom: 8px;
        }
        .comment-body {
            color: #4b5563;
            white-space: pre-wrap;
            word-wrap: break-word;
        }
        .review-state {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 600;
            margin-top: 8px;
        }
        .review-state-approved {
            background: #d1fae5;
            color: #065f46;
        }
        .review-state-changes-requested {
            background: #fee2e2;
            color: #991b1b;
        }
        .review-state-commented {
            background: #fef3c7;
            color: #92400e;
        }
        .footer {
            text-align: center;
            color: #6b7280;
            font-size: 12px;
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #ddd;
        }
        code {
            background: #f3f4f6;
            padding: 2px 6px;
            border-radius: 3px;
            font-family: 'Courier New', monospace;
        }
        pre {
            background: #f3f4f6;
            padding: 15px;
            border-radius: 4px;
            overflow-x: auto;
            margin: 15px 0;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>PR Analysis Report</h1>
            <div class="pr-meta">
                <div class="meta-item">
                    <div class="meta-label">Repository</div>
                    <div class="meta-value">${escapeHtml(pr.org)}/${escapeHtml(pr.repo)}</div>
                </div>
                <div class="meta-item">
                    <div class="meta-label">PR Number</div>
                    <div class="meta-value">#${pr.pr_number}</div>
                </div>
                <div class="meta-item">
                    <div class="meta-label">Author</div>
                    <div class="meta-value">@${escapeHtml(pr.author)}</div>
                </div>
                <div class="meta-item">
                    <div class="meta-label">State</div>
                    <div class="meta-value">
                        <span class="badge badge-${pr.state.toLowerCase()}">${escapeHtml(pr.state)}</span>
                    </div>
                </div>
                <div class="meta-item">
                    <div class="meta-label">Created</div>
                    <div class="meta-value">${formatDate(pr.created_at)}</div>
                </div>
                <div class="meta-item">
                    <div class="meta-label">Last Updated</div>
                    <div class="meta-value">${formatDate(pr.updated_at)}</div>
                </div>
            </div>
        </div>

        <div class="report-content">
            <h2>AI Analysis Report</h2>
            ${this.convertMarkdownToHTML(report.report_content)}
        </div>

        ${
          comments && comments.length > 0
            ? `
        <div class="comment-section">
            <h2>Comments (${comments.length})</h2>
            ${comments
              .map(
                (comment, idx) => `
                <div class="comment-item">
                    <div class="comment-author">${idx + 1}. @${escapeHtml(comment.author)}</div>
                    <div class="comment-body">${escapeHtml(comment.body)}</div>
                </div>
            `
              )
              .join('')}
        </div>
        `
            : ''
        }

        ${
          reviews && reviews.length > 0
            ? `
        <div class="review-section">
            <h2>Reviews (${reviews.length})</h2>
            ${reviews
              .map(
                (review, idx) => `
                <div class="review-item">
                    <div class="comment-author">${idx + 1}. @${escapeHtml(review.author)}</div>
                    <div class="review-state review-state-${review.state.toLowerCase().replace('_', '-')}">${escapeHtml(review.state)}</div>
                    ${review.body ? `<div class="comment-body" style="margin-top: 10px;">${escapeHtml(review.body)}</div>` : ''}
                </div>
            `
              )
              .join('')}
        </div>
        `
            : ''
        }

        <div class="footer">
            <p>Report generated on ${formatDate(new Date().toISOString())}</p>
            <p>PR: ${escapeHtml(pr.org)}/${escapeHtml(pr.repo)}#${pr.pr_number}</p>
        </div>
    </div>
</body>
</html>
    `;

    return html;
  }

  private convertMarkdownToHTML(markdown: string): string {
    // Simple markdown to HTML conversion
    let html = markdown;

    // Headers
    html = html.replace(/^### (.*?)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.*?)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.*?)$/gm, '<h1>$1</h1>');

    // Bold and italic
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');

    // Code blocks
    html = html.replace(/```(.*?)```/gs, '<pre><code>$1</code></pre>');
    html = html.replace(/`(.*?)`/g, '<code>$1</code>');

    // Lists
    html = html.replace(/^\* (.*?)$/gm, '<li>$1</li>');
    html = html.replace(/(\<li\>.*?\<\/li\>)/s, '<ul>$1</ul>');
    html = html.replace(/^\- (.*?)$/gm, '<li>$1</li>');

    // Line breaks
    html = html.replace(/\n\n/g, '</p><p>');
    html = '<p>' + html + '</p>';

    return html;
  }

  getFileExtension(format: ExportFormat): string {
    const extensions: Record<ExportFormat, string> = {
      markdown: 'md',
      json: 'json',
      html: 'html',
      pdf: 'pdf',
    };
    return extensions[format];
  }

  getMimeType(format: ExportFormat): string {
    const mimeTypes: Record<ExportFormat, string> = {
      markdown: 'text/markdown',
      json: 'application/json',
      html: 'text/html',
      pdf: 'application/pdf',
    };
    return mimeTypes[format];
  }
}

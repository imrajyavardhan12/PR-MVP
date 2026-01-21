export interface PullRequest {
  id?: number;
  org: string;
  repo: string;
  pr_number: number;
  title: string;
  description: string | null;
  author: string;
  state: string;
  created_at: string;
  updated_at: string;
  raw_data: any;
}

export interface PRComment {
  id?: number;
  pr_id: number;
  comment_id: number;
  author: string;
  body: string;
  created_at: string;
  raw_data: any;
}

export interface PRReview {
  id?: number;
  pr_id: number;
  review_id: number;
  author: string;
  state: string;
  body: string | null;
  submitted_at: string;
  raw_data: any;
}

export interface PRReport {
  id?: number;
  pr_id: number;
  report_content: string;
  generated_at: string;
}

export interface PRAnalysisData {
  pr: PullRequest;
  comments: PRComment[];
  reviews: PRReview[];
}

export interface BatchAnalysis {
  id?: number;
  batch_token: string;
  pr_list: Array<{ org: string; repo: string; pr_number: number }>;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  completed_count: number;
  total_count: number;
  results?: BatchResult[];
  created_at?: string;
  completed_at?: string;
  error_message?: string;
}

export interface BatchResult {
  org: string;
  repo: string;
  pr_number: number;
  success: boolean;
  pr?: PullRequest;
  report?: PRReport;
  error?: string;
}

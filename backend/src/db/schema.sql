-- Pull Requests table
CREATE TABLE IF NOT EXISTS pull_requests (
    id SERIAL PRIMARY KEY,
    org VARCHAR(255) NOT NULL,
    repo VARCHAR(255) NOT NULL,
    pr_number INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    author VARCHAR(255) NOT NULL,
    state VARCHAR(50) NOT NULL,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    raw_data JSONB NOT NULL,
    UNIQUE(org, repo, pr_number)
);

-- PR Comments table
CREATE TABLE IF NOT EXISTS pr_comments (
    id SERIAL PRIMARY KEY,
    pr_id INTEGER NOT NULL REFERENCES pull_requests(id) ON DELETE CASCADE,
    comment_id BIGINT NOT NULL,
    author VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL,
    raw_data JSONB NOT NULL,
    UNIQUE(comment_id)
);

-- PR Reviews table
CREATE TABLE IF NOT EXISTS pr_reviews (
    id SERIAL PRIMARY KEY,
    pr_id INTEGER NOT NULL REFERENCES pull_requests(id) ON DELETE CASCADE,
    review_id BIGINT NOT NULL,
    author VARCHAR(255) NOT NULL,
    state VARCHAR(50) NOT NULL,
    body TEXT,
    submitted_at TIMESTAMP NOT NULL,
    raw_data JSONB NOT NULL,
    UNIQUE(review_id)
);

-- PR Reports table
CREATE TABLE IF NOT EXISTS pr_reports (
    id SERIAL PRIMARY KEY,
    pr_id INTEGER NOT NULL REFERENCES pull_requests(id) ON DELETE CASCADE,
    report_content TEXT NOT NULL,
    generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(pr_id)
);

-- Batch Analyses table
CREATE TABLE IF NOT EXISTS batch_analyses (
    id SERIAL PRIMARY KEY,
    batch_token VARCHAR(255) NOT NULL UNIQUE,
    pr_list JSONB NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    completed_count INTEGER DEFAULT 0,
    total_count INTEGER DEFAULT 0,
    results JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    error_message TEXT
);

-- Shared Reports table
CREATE TABLE IF NOT EXISTS shared_reports (
    id SERIAL PRIMARY KEY,
    report_id INTEGER NOT NULL REFERENCES pr_reports(id) ON DELETE CASCADE,
    share_token VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255),
    expires_at TIMESTAMP,
    view_count INTEGER DEFAULT 0,
    last_accessed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(255)
);

-- PR Commits table (new)
CREATE TABLE IF NOT EXISTS pr_commits (
    id SERIAL PRIMARY KEY,
    pr_id INTEGER NOT NULL REFERENCES pull_requests(id) ON DELETE CASCADE,
    commit_sha VARCHAR(40) NOT NULL,
    commit_message TEXT NOT NULL,
    author_name VARCHAR(255),
    author_email VARCHAR(255),
    committed_at TIMESTAMP NOT NULL,
    additions INTEGER DEFAULT 0,
    deletions INTEGER DEFAULT 0,
    changed_files INTEGER DEFAULT 0,
    raw_data JSONB NOT NULL,
    UNIQUE(pr_id, commit_sha)
);

-- Commit Diff Summary table (new)
CREATE TABLE IF NOT EXISTS commit_diffs (
    id SERIAL PRIMARY KEY,
    pr_id INTEGER NOT NULL REFERENCES pull_requests(id) ON DELETE CASCADE,
    first_commit_sha VARCHAR(40),
    last_commit_sha VARCHAR(40),
    total_additions INTEGER DEFAULT 0,
    total_deletions INTEGER DEFAULT 0,
    total_changed_files INTEGER DEFAULT 0,
    files_changed JSONB, -- Array of {filename, additions, deletions, status}
    summary TEXT, -- AI-generated summary
    analyzed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(pr_id)
);

-- Last Commit Files table (NEW - Option B)
CREATE TABLE IF NOT EXISTS last_commit_files (
    id SERIAL PRIMARY KEY,
    pr_id INTEGER NOT NULL REFERENCES pull_requests(id) ON DELETE CASCADE,
    commit_sha VARCHAR(40) NOT NULL,
    commit_message TEXT NOT NULL,
    author_name VARCHAR(255),
    author_email VARCHAR(255),
    committed_at TIMESTAMP NOT NULL,
    total_additions INTEGER DEFAULT 0,
    total_deletions INTEGER DEFAULT 0,
    total_changed_files INTEGER DEFAULT 0,
    files_changed JSONB NOT NULL, -- Array of {filename, additions, deletions, status, patch}
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(pr_id)
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_pr_org_repo ON pull_requests(org, repo);
CREATE INDEX IF NOT EXISTS idx_pr_comments_pr_id ON pr_comments(pr_id);
CREATE INDEX IF NOT EXISTS idx_pr_reviews_pr_id ON pr_reviews(pr_id);
CREATE INDEX IF NOT EXISTS idx_pr_reports_pr_id ON pr_reports(pr_id);
CREATE INDEX IF NOT EXISTS idx_batch_token ON batch_analyses(batch_token);
CREATE INDEX IF NOT EXISTS idx_batch_status ON batch_analyses(status);
CREATE INDEX IF NOT EXISTS idx_pr_author ON pull_requests(author);
CREATE INDEX IF NOT EXISTS idx_pr_created_at ON pull_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pr_report_generated_at ON pr_reports(generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_pr_state ON pull_requests(state);
CREATE INDEX IF NOT EXISTS idx_shared_reports_token ON shared_reports(share_token);
CREATE INDEX IF NOT EXISTS idx_shared_reports_expires_at ON shared_reports(expires_at);
CREATE INDEX IF NOT EXISTS idx_pr_commits_pr_id ON pr_commits(pr_id);
CREATE INDEX IF NOT EXISTS idx_commit_diffs_pr_id ON commit_diffs(pr_id);
CREATE INDEX IF NOT EXISTS idx_last_commit_files_pr_id ON last_commit_files(pr_id);

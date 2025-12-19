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

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_pr_org_repo ON pull_requests(org, repo);
CREATE INDEX IF NOT EXISTS idx_pr_comments_pr_id ON pr_comments(pr_id);
CREATE INDEX IF NOT EXISTS idx_pr_reviews_pr_id ON pr_reviews(pr_id);
CREATE INDEX IF NOT EXISTS idx_pr_reports_pr_id ON pr_reports(pr_id);

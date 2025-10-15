-- schema/schema.sql

-- canonical repo table (latest metadata)
CREATE TABLE IF NOT EXISTS repositories (
  repo_id TEXT PRIMARY KEY,
  node_id TEXT,
  full_name TEXT,
  owner_login TEXT,
  name TEXT,
  url TEXT,
  stargazers INTEGER,
  repo_json JSONB,
  updated_at TIMESTAMPTZ,
  last_crawled_at TIMESTAMPTZ
);

-- daily (immutable) snapshot table
CREATE TABLE IF NOT EXISTS repo_stars_daily (
  repo_id TEXT NOT NULL REFERENCES repositories(repo_id),
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  stargazers INTEGER NOT NULL,
  PRIMARY KEY (repo_id, snapshot_date)
);

-- crawl run audit
CREATE TABLE IF NOT EXISTS crawl_runs (
  id SERIAL PRIMARY KEY,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  repos_fetched INTEGER DEFAULT 0
);

-- progress/resume helper per partition
CREATE TABLE IF NOT EXISTS crawl_progress (
  kind TEXT NOT NULL,
  key TEXT NOT NULL,
  cursor TEXT,
  completed BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (kind, key)
);

CREATE INDEX IF NOT EXISTS idx_repos_last_crawled ON repositories(last_crawled_at);

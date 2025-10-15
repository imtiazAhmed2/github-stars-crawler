-- schema.sql

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
  updated_at TIMESTAMP WITH TIME ZONE,
  last_crawled_at TIMESTAMP WITH TIME ZONE
);

-- daily snapshots (one row per repo per day)
CREATE TABLE IF NOT EXISTS repo_stars_daily (
  repo_id TEXT NOT NULL REFERENCES repositories(repo_id),
  snapshot_date DATE NOT NULL,
  stargazers INTEGER NOT NULL,
  PRIMARY KEY (repo_id, snapshot_date)
);

-- audit table for run-level tracking
CREATE TABLE IF NOT EXISTS crawl_runs (
  id SERIAL PRIMARY KEY,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  repos_fetched INTEGER DEFAULT 0
);

-- progress table to support resume: stores what (language/starRange) was last processed
CREATE TABLE IF NOT EXISTS crawl_progress (
  id SERIAL PRIMARY KEY,
  kind TEXT NOT NULL,         -- e.g. 'language_range'
  key TEXT NOT NULL,          -- e.g. 'language:JavaScript|stars:100..499'
  cursor TEXT,                -- GraphQL endCursor for resuming
  completed BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(kind, key)
);

-- small helper index to speed queries on last_crawled_at
CREATE INDEX IF NOT EXISTS idx_repos_last_crawled ON repositories(last_crawled_at);

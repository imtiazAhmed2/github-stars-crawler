CREATE TABLE IF NOT EXISTS repositories (
    id SERIAL PRIMARY KEY,
    repo_id TEXT UNIQUE,
    name TEXT,
    owner TEXT,
    full_name TEXT,
    stars INTEGER,
    url TEXT,
    fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS repo_stars_daily (
    id SERIAL PRIMARY KEY,
    repo_id TEXT,
    stars INTEGER,
    snapshot_date DATE DEFAULT CURRENT_DATE,
    UNIQUE (repo_id, snapshot_date)
);

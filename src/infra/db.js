// src/infra/db.js
import pg from "pg";

const { Pool } = pg;

export function createDbPool({ host = "localhost", user = "postgres", password = "postgres", database = "github_data", max = 10 } = {}) {
  const pool = new Pool({ host, user, password, database, max });

  async function init() {
    // We'll rely on schema.sql applied externally (Actions or local)
    await pool.query("SELECT 1");
  }

  async function close() {
    await pool.end();
  }

  async function upsertRepo(repoNode) {
    const repoId = repoNode.databaseId ? String(repoNode.databaseId) : repoNode.id;
    const upsertRepoSql = `
      INSERT INTO repositories (repo_id, node_id, full_name, owner_login, name, url, stargazers, repo_json, updated_at, last_crawled_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,now())
      ON CONFLICT (repo_id) DO UPDATE SET
        node_id=EXCLUDED.node_id,
        full_name=EXCLUDED.full_name,
        owner_login=EXCLUDED.owner_login,
        name=EXCLUDED.name,
        url=EXCLUDED.url,
        stargazers=EXCLUDED.stargazers,
        repo_json=EXCLUDED.repo_json,
        updated_at=EXCLUDED.updated_at,
        last_crawled_at=now();
    `;

    const snapshotSql = `
      INSERT INTO repo_stars_daily (repo_id, snapshot_date, stargazers)
      VALUES ($1, CURRENT_DATE, $2)
      ON CONFLICT (repo_id, snapshot_date) DO UPDATE SET stargazers = EXCLUDED.stargazers;
    `;

    const params = [
      repoId,
      repoNode.id,
      `${repoNode.owner.login}/${repoNode.name}`,
      repoNode.owner.login,
      repoNode.name,
      repoNode.url,
      repoNode.stargazerCount || 0,
      JSON.stringify(repoNode),
      repoNode.updatedAt || null
    ];

    await pool.query(upsertRepoSql, params);
    await pool.query(snapshotSql, [repoId, repoNode.stargazerCount || 0]);
  }

  async function getProgress(kind, key) {
    const res = await pool.query("SELECT * FROM crawl_progress WHERE kind=$1 AND key=$2", [kind, key]);
    return res.rows[0] || null;
  }

  async function setProgress(kind, key, cursor, completed = false) {
    await pool.query(`
      INSERT INTO crawl_progress (kind, key, cursor, completed, updated_at)
      VALUES ($1,$2,$3,$4,now())
      ON CONFLICT (kind, key) DO UPDATE SET cursor=EXCLUDED.cursor, completed=EXCLUDED.completed, updated_at=now();
    `, [kind, key, cursor, completed]);
  }

  async function newRun() {
    const r = await pool.query("INSERT INTO crawl_runs (started_at) VALUES (now()) RETURNING id");
    return r.rows[0].id;
  }
  async function finishRun(id, count) {
    await pool.query("UPDATE crawl_runs SET finished_at = now(), repos_fetched = $2 WHERE id = $1", [id, count]);
  }

  async function countRepos() {
    const r = await pool.query("SELECT COUNT(*)::int as c FROM repositories");
    return r.rows[0].c;
  }

  return {
    pool,
    init,
    close,
    upsertRepo,
    getProgress,
    setProgress,
    newRun,
    finishRun,
    countRepos
  };
}

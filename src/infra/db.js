// src/infra/db.js
import pg from "pg";
const { Client } = pg;

export function createDbClient({ host, user, password, database }) {
  const client = new Client({ host, user, password, database });
  async function connect() { await client.connect(); }
  async function end() { await client.end(); }

  async function upsertRepo(repoNode) {
    // repoNode: fields from GraphQL
    const repoId = repoNode.databaseId ? String(repoNode.databaseId) : repoNode.id;
    const q1 = `
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
    const q2 = `
      INSERT INTO repo_stars_daily (repo_id, snapshot_date, stargazers)
      VALUES ($1, CURRENT_DATE, $2)
      ON CONFLICT (repo_id, snapshot_date) DO UPDATE SET stargazers = EXCLUDED.stargazers;
    `;

    const params1 = [
      repoId,
      repoNode.id,
      `${repoNode.owner.login}/${repoNode.name}`,
      repoNode.owner.login,
      repoNode.name,
      repoNode.url,
      repoNode.stargazerCount || 0,
      JSON.stringify(repoNode),
      repoNode.updatedAt
    ];

    await client.query(q1, params1);
    await client.query(q2, [repoId, repoNode.stargazerCount || 0]);
    return repoId;
  }

  // progress helpers
  async function getProgress(kind, key) {
    const res = await client.query("SELECT * FROM crawl_progress WHERE kind=$1 AND key=$2", [kind, key]);
    return res.rows[0] || null;
  }
  async function setProgress(kind, key, cursor, completed = false) {
    await client.query(`
      INSERT INTO crawl_progress (kind, key, cursor, completed, updated_at)
      VALUES ($1,$2,$3,$4,now())
      ON CONFLICT (kind, key) DO UPDATE SET cursor=EXCLUDED.cursor, completed=EXCLUDED.completed, updated_at=now();
    `, [kind, key, cursor, completed]);
  }

  async function newRun() {
    const r = await client.query("INSERT INTO crawl_runs (started_at) VALUES (now()) RETURNING id");
    return r.rows[0].id;
  }
  async function finishRun(id, count) {
    await client.query("UPDATE crawl_runs SET finished_at = now(), repos_fetched = $2 WHERE id = $1", [id, count]);
  }

  return {
    client,
    connect,
    end,
    upsertRepo,
    getProgress,
    setProgress,
    newRun,
    finishRun
  };
}

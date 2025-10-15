import fetch from "node-fetch";
import pg from "pg";
import process from "process";

const { Client } = pg;

// Environment variables
const TOKEN = process.env.GITHUB_TOKEN;
const DB_HOST = process.env.DB_HOST || "localhost";
const DB_USER = process.env.DB_USER || "postgres";
const DB_PASS = process.env.DB_PASS || "postgres";
const DB_NAME = process.env.DB_NAME || "github_data";

const GRAPHQL_URL = "https://api.github.com/graphql";

async function runQuery(query, variables = {}) {
  const res = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TOKEN}`,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    console.log("Error:", res.status);
    await new Promise((r) => setTimeout(r, 5000));
    return null;
  }

  const json = await res.json();
  if (json.errors) {
    console.log("GraphQL errors:", json.errors);
    await new Promise((r) => setTimeout(r, 5000));
    return null;
  }
  return json.data;
}

async function upsertRepo(client, repo) {
  const query1 = `
    INSERT INTO repositories (repo_id, name, owner, full_name, stars, url, fetched_at)
    VALUES ($1, $2, $3, $4, $5, $6, NOW())
    ON CONFLICT (repo_id) DO UPDATE
    SET stars = EXCLUDED.stars, fetched_at = EXCLUDED.fetched_at;
  `;
  const query2 = `
    INSERT INTO repo_stars_daily (repo_id, stars)
    VALUES ($1, $2)
    ON CONFLICT (repo_id, snapshot_date) DO UPDATE SET stars = EXCLUDED.stars;
  `;
  await client.query(query1, [
    repo.id,
    repo.name,
    repo.owner.login,
    repo.nameWithOwner,
    repo.stargazerCount,
    repo.url,
  ]);
  await client.query(query2, [repo.id, repo.stargazerCount]);
}

async function crawl(target = 100000) {
  console.log(`Fetching ${target} repositories...`);

  const client = new Client({
    host: DB_HOST,
    user: DB_USER,
    password: DB_PASS,
    database: DB_NAME,
  });
  await client.connect();

  // const query = `
  //   query ($cursor: String) {
  //     search(query: "stars:>100", type: REPOSITORY, first: 50, after: $cursor) {
  //       repositoryCount
  //       pageInfo { endCursor hasNextPage }
  //       nodes {
  //         id
  //         name
  //         nameWithOwner
  //         stargazerCount
  //         url
  //         owner { login }
  //       }
  //     }
  //     rateLimit { remaining resetAt }
  //   }
  // `;


  const query = `
  query ($cursor: String) {
    search(query: "stars:>100", type: REPOSITORY, first: 50, after: $cursor) {
      repositoryCount
      pageInfo { endCursor hasNextPage }
      nodes {
        ... on Repository {
          id
          name
          nameWithOwner
          stargazerCount
          url
          owner { login }
        }
      }
    }
    rateLimit { remaining resetAt }
  }
`;


  let cursor = null;
  let count = 0;

  while (count < target) {
    const data = await runQuery(query, { cursor });
    if (!data) continue;

    const repos = data.search.nodes;
    const pageInfo = data.search.pageInfo;
    const rate = data.rateLimit;

    for (const repo of repos) {
      await upsertRepo(client, repo);
      count++;
      console.log(`Saved ${repo.nameWithOwner} (${repo.stargazerCount}⭐) [${count}/${target}]`);
      if (count >= target) break;
    }

    cursor = pageInfo.endCursor;
    if (!pageInfo.hasNextPage) break;

    if (rate.remaining < 10) {
      const resetTime = new Date(rate.resetAt).getTime();
      const waitSec = Math.max((resetTime - Date.now()) / 1000, 10);
      console.log(`⏳ Rate limit reached. Waiting ${Math.ceil(waitSec)}s...`);
      await new Promise((r) => setTimeout(r, waitSec * 1000));
    }
  }

  await client.end();
  console.log("✅ Done crawling.");
}

// CLI argument
const targetArg = process.argv.find((a) => a.startsWith("--target="));
const target = targetArg ? parseInt(targetArg.split("=")[1]) : 100000;

crawl(target).catch((err) => console.error("Error:", err));

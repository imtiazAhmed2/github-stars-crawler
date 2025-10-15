// crawl_stars.js
import fetch from "node-fetch";
import pg from "pg";

const { Client } = pg;
const TOKEN = process.env.GITHUB_TOKEN || process.env.GITHUB_TOKEN_DEFAULT;
const GRAPHQL_URL = "https://api.github.com/graphql";

const client = new Client({
  host: "localhost",
  user: "postgres",
  password: "postgres",
  database: "github_data",
  port: 5432,
});

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runQuery(query, variables) {
  try {
    const res = await fetch(GRAPHQL_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TOKEN}`,
      },
      body: JSON.stringify({ query, variables }),
    });

    const json = await res.json();
    if (!res.ok || json.errors) {
      console.error("❌ Query error:", json.errors || res.status);
      await sleep(5000);
      return null;
    }

    return json.data;
  } catch (err) {
    console.error("⚠️ Network error:", err.message);
    await sleep(5000);
    return null;
  }
}

async function upsertRepo(repo) {
  const q1 = `
    INSERT INTO repositories (repo_id, name, owner, full_name, stars, url, fetched_at)
    VALUES ($1,$2,$3,$4,$5,$6,NOW())
    ON CONFLICT (repo_id)
    DO UPDATE SET stars=EXCLUDED.stars, fetched_at=EXCLUDED.fetched_at;
  `;
  const q2 = `
    INSERT INTO repo_stars_daily (repo_id, stars)
    VALUES ($1,$2)
    ON CONFLICT (repo_id, snapshot_date)
    DO UPDATE SET stars=EXCLUDED.stars;
  `;

  await client.query(q1, [
    repo.id,
    repo.name,
    repo.owner.login,
    repo.nameWithOwner,
    repo.stargazerCount,
    repo.url,
  ]);

  await client.query(q2, [repo.id, repo.stargazerCount]);
}

async function crawlSearch(queryString, seenIds, totalTarget) {
  const query = `
    query ($cursor: String, $q: String!) {
      search(query: $q, type: REPOSITORY, first: 100, after: $cursor) {
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

  while (seenIds.size < totalTarget) {
    const data = await runQuery(query, { cursor, q: queryString });
    if (!data) break;

    const repos = data.search.nodes;
    const pageInfo = data.search.pageInfo;
    const rate = data.rateLimit;

    for (const repo of repos) {
      if (seenIds.has(repo.id)) continue;
      seenIds.add(repo.id);
      await upsertRepo(repo);
      console.log(`💾 [${seenIds.size}/${totalTarget}] ${repo.nameWithOwner} (${repo.stargazerCount}⭐)`);

      if (seenIds.size >= totalTarget) break;
    }

    cursor = pageInfo.endCursor;
    if (!pageInfo.hasNextPage) break;

    if (rate.remaining < 5) {
      const wait = Math.max((new Date(rate.resetAt) - Date.now()) / 1000, 10);
      console.log(`⏳ Waiting ${Math.ceil(wait)}s for rate reset...`);
      await sleep(wait * 1000);
    }
  }
}

async function crawlAll() {
  await client.connect();
  console.log("✅ Connected to PostgreSQL");

  const languages = [
    "JavaScript","Python","Java","TypeScript","C++","C","C#","Go","PHP","Ruby",
    "Swift","Kotlin","Rust","Scala","Dart","Shell","R","Objective-C","Perl","Haskell","Lua",
    "Elixir","Clojure","Julia","VBA","Visual Basic","MATLAB","PowerShell","Groovy","Assembly","F#",
    "Erlang","Vim Script","PL/SQL","Fortran"
  ];

  const starRanges = [
    "stars:>10000",
    "stars:5000..9999",
    "stars:1000..4999",
    "stars:500..999",
    "stars:100..499",
    "stars:50..99",
    "stars:10..49",
    "stars:1..9"
  ];

  const seenIds = new Set();
  const TARGET = parseInt(process.argv[2]?.split("=")[1]) || 100000;

  for (const lang of languages) {
    for (const range of starRanges) {
      if (seenIds.size >= TARGET) break;
      const q = `language:${lang} ${range}`;
      console.log(`\n🚀 Crawling ${q} (need ${TARGET - seenIds.size} more)`);
      await crawlSearch(q, seenIds, TARGET);
    }
    if (seenIds.size >= TARGET) break;
  }

  console.log(`🎯 Total collected: ${seenIds.size} repositories`);
  await client.end();
  console.log("🧹 Database connection closed");
}

crawlAll().catch(console.error);

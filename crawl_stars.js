import fetch from "node-fetch";
import pg from "pg";
const { Client } = pg;

const TOKEN = process.env.GITHUB_TOKEN;
const GRAPHQL_URL = "https://api.github.com/graphql";

const client = new Client({
  host: "localhost",
  user: "postgres",
  password: "postgres",
  database: "github_data",
});

async function runQuery(query, variables) {
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
    console.error("Query error:", json.errors || res.status);
    await new Promise(r => setTimeout(r, 5000));
    return null;
  }
  return json.data;
}

async function upsertRepo(repo) {
  const q1 = `
    INSERT INTO repositories (repo_id, name, owner, full_name, stars, url, fetched_at)
    VALUES ($1,$2,$3,$4,$5,$6,NOW())
    ON CONFLICT (repo_id) DO UPDATE SET stars=EXCLUDED.stars, fetched_at=EXCLUDED.fetched_at;
  `;
  const q2 = `
    INSERT INTO repo_stars_daily (repo_id, stars)
    VALUES ($1,$2)
    ON CONFLICT (repo_id, snapshot_date) DO UPDATE SET stars=EXCLUDED.stars;
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

async function crawlSearch(queryString, totalTarget) {
  const query = `
    query ($cursor: String, $q: String!) {
      search(query: $q, type: REPOSITORY, first: 50, after: $cursor) {
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
  let cursor = null, count = 0;

  while (count < totalTarget) {
    const data = await runQuery(query, { cursor, q: queryString });
    if (!data) continue;

    const repos = data.search.nodes;
    const pageInfo = data.search.pageInfo;
    const rate = data.rateLimit;

    for (const repo of repos) {
      await upsertRepo(repo);
      count++;
      console.log(`💾 ${repo.nameWithOwner} (${repo.stargazerCount}⭐) — ${count}`);
    }

    cursor = pageInfo.endCursor;
    if (!pageInfo.hasNextPage) break;

    if (rate.remaining < 5) {
      const wait = Math.max((new Date(rate.resetAt) - Date.now()) / 1000, 10);
      console.log(`⏳ Waiting ${Math.ceil(wait)}s for rate reset...`);
      await new Promise(r => setTimeout(r, wait * 1000));
    }
  }

  console.log(`✅ Finished search: ${queryString} (${count} repos)`);
  return count;
}

async function crawlAll() {
  await client.connect();

  const languages = ["JavaScript","Python","Java","TypeScript","C++","C","C#","Go","PHP","Ruby","Swift","Kotlin","Rust","Scala","Dart","Shell","R","Objective-C",
                     "Perl","Haskell","Lua","Elixir","Clojure","Julia","VBA","Visual Basic","MATLAB","PowerShell","Groovy","Assembly","F#","Erlang","Vim Script",
                     "PL/SQL","Fortran"];
  const starRanges = [
    "stars:>10000",
    "stars:5000..9999",
    "stars:1000..4999",
    "stars:500..999",
    "stars:100..499",
    "stars:50..99",
    "stars:10..49"
  ];

  let total = 0;
  for (const lang of languages) {
    for (const range of starRanges) {
      const q = `language:${lang} ${range}`;
      console.log(`\n🚀 Crawling ${q}`);
      const count = await crawlSearch(q, 1000);
      total += count;
      if (total >= 100000) break;
    }
    if (total >= 100000) break;
  }

  console.log(`🎯 Total collected: ${total} repositories`);
  await client.end();
}

crawlAll().catch(console.error);

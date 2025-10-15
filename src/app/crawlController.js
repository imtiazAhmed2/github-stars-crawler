// src/app/crawlController.js
import createGithubClient from "../infra/githubClient.js";
import { createDbClient } from "../infra/db.js";

const SEARCH_QUERY = `
query ($q: String!, $cursor: String) {
  search(query: $q, type: REPOSITORY, first: 50, after: $cursor) {
    repositoryCount
    pageInfo { endCursor hasNextPage }
    nodes {
      ... on Repository {
        id
        databaseId
        name
        url
        stargazerCount
        updatedAt
        owner { login }
      }
    }
  }
  rateLimit { remaining resetAt }
}
`;

function starRangeStrings() {
  return [
    "stars:>10000",
    "stars:5000..9999",
    "stars:1000..4999",
    "stars:500..999",
    "stars:100..499",
    "stars:50..99",
    "stars:10..49",
    "stars:0..9"
  ];
}

export async function runCrawl({
  token,
  dbConfig,
  totalTarget = 100000,
  languages = ["JavaScript","Python","Java","TypeScript","C++","Go","C#","PHP","Ruby","Rust","Swift","Kotlin","Dart"],
}) {
  const gh = createGithubClient(token);
  const db = createDbClient(dbConfig);
  await db.connect();
  const runId = await db.newRun();
  let globalCount = 0;

  for (const lang of languages) {
    for (const range of starRangeStrings()) {
      if (globalCount >= totalTarget) break;
      const key = `language:${lang}|${range}`;
      // resume info
      const prog = await db.getProgress("language_range", key);
      let cursor = prog ? prog.cursor : null;
      let completed = prog ? prog.completed : false;
      if (completed) {
        console.log("Skipping completed:", key);
        continue;
      }

      console.log("Starting partition:", key, "cursor:", cursor);
      let pageHasNext = true;
      while (pageHasNext && globalCount < totalTarget) {
        const data = await gh.runQuery(SEARCH_QUERY, { q: `language:${lang} ${range}`, cursor });
        if (!data) {
          // if transient problem, wait and try again (client handles retries)
          await gh.sleep(5000);
          continue;
        }

        const search = data.search;
        if (!search) break;

        for (const node of search.nodes) {
          // stop exactly at totalTarget
          if (globalCount >= totalTarget) break;
          await db.upsertRepo(node);
          globalCount++;
          if (globalCount % 100 === 0) console.log("Progress:", globalCount);
        }

        // save progress cursor
        cursor = search.pageInfo.endCursor;
        pageHasNext = search.pageInfo.hasNextPage;
        await db.setProgress("language_range", key, cursor, false);

        // check rate limit
        const rate = data.rateLimit;
        if (rate && rate.remaining < 10) {
          const resetAt = new Date(rate.resetAt).getTime();
          const waitMs = Math.max(resetAt - Date.now() + 3000, 10000);
          console.log(`Rate low (${rate.remaining}). Sleeping ${Math.ceil(waitMs/1000)}s`);
          await gh.sleep(waitMs);
        }
      }

      // mark partition complete
      await db.setProgress("language_range", key, null, true);
      console.log("Completed partition:", key);
    }
  }

  await db.finishRun(runId, globalCount);
  await db.end();
  return globalCount;
}

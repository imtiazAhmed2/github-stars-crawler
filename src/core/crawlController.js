// src/core/crawlController.js
/* Orchestrates crawling by partitions (language + star range).
   Injects githubClient (runQuery) and db (DAL) for testability.
*/

const SEARCH_QUERY = `
query ($q: String!, $cursor: String) {
  search(query: $q, type: REPOSITORY, first: 100, after: $cursor) {
    repositoryCount
    pageInfo { endCursor hasNextPage }
    nodes {
      ... on Repository {
        id
        databaseId
        name
        nameWithOwner
        stargazerCount
        url
        updatedAt
        owner { login }
      }
    }
  }
  rateLimit { remaining resetAt }
}
`;

const DEFAULT_LANGUAGES = [
  "JavaScript","Python","Java","TypeScript","C++","C","C#","Go","PHP",
  "Ruby","Swift","Kotlin","Rust","Scala","Dart","Shell","R","Objective-C",
  "Perl","Haskell","Lua","Elixir","Clojure","Julia","VBA","MATLAB",
  "PowerShell","Groovy","Assembly","F#","Erlang","Vim Script","PL/SQL","Fortran"
];

const DEFAULT_RANGES = [
  "stars:>10000",
  "stars:5000..9999",
  "stars:1000..4999",
  "stars:500..999",
  "stars:100..499",
  "stars:50..99",
  "stars:10..49",
  "stars:1..9"
];

export function createCrawlController({ githubClient, db, languages = DEFAULT_LANGUAGES, starRanges = DEFAULT_RANGES }) {
  if (!githubClient) throw new Error("githubClient required");
  if (!db) throw new Error("db required");

  async function crawlPartition(lang, range, targetGlobal, runId) {
    const kind = "language_range";
    const key = `language:${lang}|${range}`;
    const prog = await db.getProgress(kind, key);
    let cursor = prog && prog.completed ? null : (prog ? prog.cursor : null);

    while (true) {
      const currentCount = await db.countRepos();
      if (currentCount >= targetGlobal) {
        await db.setProgress(kind, key, cursor, true);
        return;
      }

      const q = `language:${lang} ${range}`;
      const data = await githubClient.runQuery(SEARCH_QUERY, { q, cursor });

      if (!data) {
        // transient error handled in githubClient with retries
        await githubClient.sleep(2000);
        continue;
      }

      const search = data.search;
      if (!search) {
        await db.setProgress(kind, key, null, true);
        return;
      }

      for (const node of search.nodes || []) {
        const current = await db.countRepos();
        if (current >= targetGlobal) {
          await db.setProgress(kind, key, search.pageInfo.endCursor, true);
          return;
        }

        try {
          // Anti-corruption: map/normalize happens inside db.upsertRepo (we only pass fields we need)
          await db.upsertRepo(node);
        } catch (err) {
          console.warn("DB upsert error:", err.message);
        }
      }

      // save progress cursor
      cursor = search.pageInfo.endCursor;
      await db.setProgress(kind, key, cursor, false);

      // rate-limit handling
      if (data.rateLimit && data.rateLimit.remaining < 10) {
        const resetAt = new Date(data.rateLimit.resetAt).getTime();
        const waitMs = Math.max(resetAt - Date.now() + 2000, 10000);
        console.log(`Rate low (${data.rateLimit.remaining}). Sleeping ${Math.ceil(waitMs/1000)}s`);
        await githubClient.sleep(waitMs);
      }

      if (!search.pageInfo.hasNextPage) {
        await db.setProgress(kind, key, null, true);
        return;
      }

      // small throttle
      await githubClient.sleep(200);
    }
  }

  async function run(target = 100000) {
    const runId = await db.newRun();
    console.log("Crawl run id:", runId, "target:", target);

    for (const lang of languages) {
      for (const range of starRanges) {
        const countNow = await db.countRepos();
        if (countNow >= target) {
          await db.finishRun(runId, countNow);
          return countNow;
        }
        console.log(`Starting partition: ${lang} | ${range}`);
        try {
          await crawlPartition(lang, range, target, runId);
        } catch (err) {
          console.error("Partition error:", err.message);
        }
      }
    }

    const final = await db.countRepos();
    await db.finishRun(runId, final);
    return final;
  }

  return { run };
}

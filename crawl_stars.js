async function crawlSearch(queryString, totalTarget, currentTotal) {
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

  while (count < totalTarget && currentTotal + count < 100000) { // ✅ Stop when global total hits 100k
    const data = await runQuery(query, { cursor, q: queryString });
    if (!data) continue;

    const repos = data.search.nodes;
    const pageInfo = data.search.pageInfo;
    const rate = data.rateLimit;

    for (const repo of repos) {
      if (currentTotal + count >= 100000) break; // ✅ Hard limit
      await upsertRepo(repo);
      count++;
      console.log(`💾 ${repo.nameWithOwner} (${repo.stargazerCount}⭐) — ${currentTotal + count}`);
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
      if (total >= 100000) break; // ✅ stop looping early
      const q = `language:${lang} ${range}`;
      console.log(`\n🚀 Crawling ${q}`);
      const count = await crawlSearch(q, 1000, total);
      total += count;
    }
  }

  console.log(`🎯 Total collected: ${total} repositories`);
  await client.end();
}

crawlAll().catch(console.error);

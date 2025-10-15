// src/infra/githubClient.js
import fetch from "node-fetch";

const GRAPHQL_URL = "https://api.github.com/graphql";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export default function createGithubClient({ token, maxRetries = 6 } = {}) {
  if (!token) throw new Error("GITHUB token required");

  async function runQuery(query, variables = {}) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const res = await fetch(GRAPHQL_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ query, variables })
        });

        const json = await res.json();

        if (!res.ok) {
          const retryAfter = res.headers.get("retry-after");
          const wait = retryAfter ? parseInt(retryAfter, 10) * 1000 : 1000 * Math.pow(2, attempt);
          console.warn(`HTTP ${res.status} — retrying in ${Math.ceil(wait/1000)}s`);
          await sleep(wait);
          continue;
        }

        if (json.errors) {
          // could be transient; log and backoff
          console.warn("GraphQL errors:", json.errors);
          await sleep(1000 * Math.pow(2, attempt));
          continue;
        }

        return json.data;
      } catch (err) {
        console.warn("Network error:", err.message);
        await sleep(1000 * Math.pow(2, attempt));
      }
    }

    throw new Error("GraphQL query failed after retries");
  }

  return { runQuery, sleep };
}

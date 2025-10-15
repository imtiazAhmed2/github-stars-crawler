// src/infra/githubClient.js
import fetch from "node-fetch";

const GRAPHQL_URL = "https://api.github.com/graphql";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export default function createGithubClient(token, opts = {}) {
  if (!token) throw new Error("GITHUB_TOKEN required");

  const maxRetries = opts.maxRetries || 6;

  async function runQuery(query, variables = {}) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const res = await fetch(GRAPHQL_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ query, variables }),
      });

      let json;
      try {
        json = await res.json();
      } catch (err) {
        // transient JSON parse error
        console.error("JSON parse error", err);
        await sleep(1000 * Math.pow(2, attempt));
        continue;
      }

      // HTTP error
      if (!res.ok) {
        console.warn(`HTTP ${res.status} - attempt ${attempt + 1}`);
        // honor Retry-After if supplied
        const retryAfter = res.headers.get("retry-after");
        if (retryAfter) await sleep(parseInt(retryAfter, 10) * 1000);
        else await sleep(1000 * Math.pow(2, attempt));
        continue;
      }

      // GraphQL errors
      if (json.errors) {
        // If rate-limit like error appears, handle specially
        console.warn("GraphQL errors:", json.errors);
        // backoff then retry
        await sleep(1000 * Math.pow(2, attempt));
        continue;
      }

      // successful response
      return json.data;
    }

    throw new Error("GraphQL query failed after retries");
  }

  return { runQuery, sleep };
}

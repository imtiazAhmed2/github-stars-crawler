// src/interfaces/cli/crawl.js
import dotenv from "dotenv";
dotenv.config();

import createGithubClient from "../../infra/githubClient.js";
import { createDbPool } from "../../infra/db.js";
import { createCrawlController } from "../../core/crawlController.js";

const token = process.env.GITHUB_TOKEN;
if (!token) {
  console.error("Set GITHUB_TOKEN in env (for Actions use secrets.GITHUB_TOKEN).");
  process.exit(1);
}

const dbConfig = {
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASS || process.env.POSTGRES_PASSWORD || "postgres",
  database: process.env.DB_NAME || "github_data"
};

const githubClient = createGithubClient({ token });
const db = createDbPool(dbConfig);

const controller = createCrawlController({ githubClient, db });

const args = process.argv.slice(2);
let target = 100000;
for (const a of args) {
  if (a.startsWith("--target=")) target = parseInt(a.split("=")[1], 10);
}

async function main() {
  try {
    await db.init();
    const count = await controller.run(target);
    console.log("Crawl finished. total repos:", count);
  } catch (err) {
    console.error("Crawl failed:", err);
  } finally {
    await db.close();
  }
}

main();

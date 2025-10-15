#!/usr/bin/env node
import { runCrawl } from "./src/app/crawlController.js";
import dotenv from "dotenv";
dotenv.config();

const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
if (!token) {
  console.error("GITHUB_TOKEN missing. In Actions use secrets.GITHUB_TOKEN.");
  process.exit(1);
}

const dbConfig = {
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || process.env.POSTGRES_USER || "postgres",
  password: process.env.DB_PASS || process.env.POSTGRES_PASSWORD || "postgres",
  database: process.env.DB_NAME || "github_data"
};

const targetArg = process.argv.find((a) => a.startsWith("--target="));
const totalTarget = targetArg ? parseInt(targetArg.split("=")[1]) : 100000;

runCrawl({ token, dbConfig, totalTarget })
  .then((count) => {
    console.log("Crawl finished, total repos:", count);
  })
  .catch((err) => {
    console.error("Crawl failed:", err);
    process.exit(2);
  });

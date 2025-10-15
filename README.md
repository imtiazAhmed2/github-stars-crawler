This project is a GitHub Stars Crawler written in Node.js that uses the GitHub GraphQL API to collect and store star counts for 100,000 public repositories across multiple programming languages.

It respects GitHub rate limits, implements retry mechanisms, and stores results efficiently in a PostgreSQL database.
A GitHub Actions workflow (crawl-stars.yml) automates the entire process.

<h2>Features</h2>

<ul>
  <li>Fetches data of up to <strong>100,000 repositories</strong> using the GitHub GraphQL API</li>
  <li>Respects API rate limits and implements <strong>exponential backoff</strong></li>
  <li>Uses <strong>PostgreSQL</strong> with an efficient upsert schema</li>
  <li>Designed for <strong>daily continuous crawling</strong></li>
  <li>Built with <strong>clean architecture</strong> and separation of concerns</li>
  <li>Easily extendable to collect <strong>issues, PRs, comments, reviews, and CI data</strong> in the future</li>
</ul>

<h2>Project Structure</h2> 
<ul>
  <li><strong>github-stars-crawler/</strong>
    <ul>
      <li><code>crawl_stars.js</code> — Main Node.js script for crawling repositories</li>
      <li><code>package.json</code> — Project dependencies and scripts</li>
      <li><code>schema.sql</code> — Database schema</li>
      <li><strong>.github/</strong>
        <ul>
          <li><strong>workflows/</strong>
            <ul>
              <li><code>crawl-stars.yml</code> — GitHub Actions workflow</li>
            </ul>
          </li>
        </ul>
      </li>
    </ul>
  </li>
</ul>
<h2>Software Engineering Practices Followed</h2> 
<h3>Principle	How It's Applied</h3>
<ul>
  <li><strong>Clean Architecture</strong> — Code separated into logical functions (<code>runQuery</code>, <code>upsertRepo</code>, <code>crawlSearch</code>, <code>crawlAll</code>)</li>
  <li><strong>Separation of Concerns</strong> — Database, API, and crawling logic are independent</li>
  <li><strong>Immutability</strong> — API responses are treated as immutable and stored as new snapshots daily</li>
  <li><strong>Retry & Error Handling</strong> — Robust retry mechanisms for API and network errors</li>
  <li><strong>Scalability</strong> — Modular design ready for distributed crawling</li>
  <li><strong>Anti-Corruption Layer</strong> — GraphQL API responses are parsed into normalized repo entities before DB writes</li>
</ul>


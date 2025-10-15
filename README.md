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
<h2>Scaling from 100K → 500 Million Repositories</h2>
<p>If scaling from <strong>100K</strong> to <strong>500M</strong> repositories, the following major architectural upgrades are required:</p>

<ul>
  <li><strong>Distributed Architecture</strong>
    <ul>
      <li>Use multiple crawler workers managed via <strong>Kubernetes</strong> or <strong>Docker Swarm</strong></li>
      <li>Employ a message queue such as <strong>Kafka</strong> or <strong>RabbitMQ</strong> to distribute crawling jobs</li>
    </ul>
  </li>
  <li><strong>Database Scaling</strong>
    <ul>
      <li>Use <strong>sharded PostgreSQL</strong>, <strong>CockroachDB</strong>, or <strong>TimescaleDB</strong></li>
      <li>Partition tables by <code>repo_id</code> or <code>date</code> for faster writes</li>
      <li>Store raw API responses in <strong>S3</strong> for long-term archival</li>
    </ul>
  </li>
  <li><strong>Parallel Rate Limit Management</strong>
    <ul>
      <li>Rotate a pool of <strong>GitHub API tokens</strong> dynamically</li>
      <li>Track and monitor rate limits for each token independently</li>
    </ul>
  </li>
  <li><strong>Incremental Crawling</strong>
    <ul>
      <li>Fetch only repositories updated recently (using the <code>updatedAt</code> field)</li>
      <li>Avoid re-crawling stale repositories to save bandwidth and processing time</li>
    </ul>
  </li>
  <li><strong>Infrastructure Enhancements</strong>
    <ul>
      <li>Add <strong>auto-scaling compute nodes</strong></li>
      <li>Implement centralized logging and metrics via <strong>Grafana + Prometheus</strong></li>
      <li>Add <strong>checkpointing</strong> for crash recovery</li>
    </ul>
  </li>
</ul>
<h2>Schema Evolution for More Metadata</h2>
<p>To support additional GitHub metadata (issues, pull requests, comments, reviews, commits, CI checks), the database schema can evolve as follows:</p>

<ul>
  <li><strong>Separate Tables for Each Entity</strong>
    <ul>
      <li><code>issues</code> table: <code>issue_id</code>, <code>repo_id</code>, <code>title</code>, <code>state</code>, <code>created_at</code>, <code>updated_at</code></li>
      <li><code>pull_requests</code> table: <code>pr_id</code>, <code>repo_id</code>, <code>title</code>, <code>state</code>, <code>created_at</code>, <code>merged_at</code></li>
      <li><code>comments</code> table: <code>comment_id</code>, <code>entity_type</code> (issue/pr), <code>entity_id</code>, <code>body</code>, <code>author</code>, <code>created_at</code></li>
      <li><code>reviews</code> table: <code>review_id</code>, <code>pr_id</code>, <code>reviewer</code>, <code>state</code>, <code>created_at</code></li>
      <li><code>commits</code> table: <code>commit_id</code>, <code>pr_id</code>, <code>message</code>, <code>author</code>, <code>timestamp</code></li>
      <li><code>ci_checks</code> table: <code>check_id</code>, <code>pr_id</code>, <code>status</code>, <code>conclusion</code>, <code>timestamp</code></li>
    </ul>
  </li>

  <li><strong>Versioning / Snapshot Tables</strong>
    <ul>
      <li>Track changes over time (e.g., PR comment count increasing)</li>
      <li>Use snapshot tables with <code>date</code> or <code>version</code> columns</li>
      <li>Example: <code>repo_stars_daily</code> demonstrates this principle</li>
    </ul>
  </li>

  <li><strong>Indexes for Efficient Updates</strong>
    <ul>
      <li>Use unique constraints and indexes on (<code>entity_id</code>, <code>snapshot_date</code>) to minimize affected rows during updates</li>
    </ul>
  </li>

  <li><strong>Normalization and Foreign Keys</strong>
    <ul>
      <li>Maintain relationships between repos, issues, PRs, and commits via foreign keys</li>
      <li>Reduces redundancy and ensures consistency while supporting complex queries</li>
    </ul>
  </li>

  <li><strong>Incremental Updates</strong>
    <ul>
      <li>Fetch only new or updated metadata daily</li>
      <li>Update rows using <code>ON CONFLICT DO UPDATE</code> or similar strategies to minimize writes</li>
    </ul>
  </li>
</ul>


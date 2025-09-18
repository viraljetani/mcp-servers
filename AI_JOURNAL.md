# AI Project Journal: `mcp-servers`

**Project Name:** `mcp-servers`
**Purpose:** A Node.js-based Micro-Cloud-Proxy (MCP) server designed to act as an intelligent proxy for AWS CloudWatch Logs. It facilitates efficient and contextual log retrieval for AI agents (like Gemini or Cursor) and human developers, by caching logs locally and providing a unified search interface.
**Date of Creation:** September 18, 2025
**Last Updated:** September 18, 2025 (End of current session)
**AI Agent:** Gemini

---

## 1. Initial Setup & Context

**User's Starting Point:**
The user provided a folder structure of their `/Users/viraljetani/Sites` directory, which contained several projects (`console`, `drivo`, `platform`, `public-interface`), many of which were Node.js/TypeScript based. The user expressed a need for a way to provide log context for debugging, specifically from AWS CloudWatch for `edge` and `gatecon` services, and generally for all projects.

**Initial Actions:**
- Created `GEMINI.md` in the root `/Users/viraljetani/Sites` for general project overview.
- Provided a structured template for `GEMINI.md` to organize project details.

---

## 2. Feature: Basic MCP Server for CloudWatch Logs

**User Request:** "Can you create an MCP server which connects to our aws Cloudwatch and so you can have a context on our logs?"

**Initial Design & Rationale:**
- **Technology Stack:** Node.js with Express.js was chosen due to its alignment with the user's existing project technologies (evident from `package.json` files in `console`, `drivo`, `public-interface`). This ensures familiarity and easier integration.
- **Core Functionality:** A simple Express.js server with a `/logs` endpoint was proposed to fetch logs from a specified CloudWatch Log Group.
- **AWS SDK:** The `@aws-sdk/client-cloudwatch-logs` was chosen for interacting with CloudWatch.

**Key Decisions & Challenges:**

-   **AWS Credentials Management:**
    -   **Initial Approach:** Storing `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` in a `.env` file.
    -   **User Feedback:** User requested using AWS CLI profiles for better security and convenience.
    -   **Refinement:** Modified the `CloudWatchLogsClient` to automatically pick up credentials from the environment (including `~/.aws/credentials` and `~/.aws/config`) when `AWS_PROFILE` is set. This is a more secure and idiomatic AWS practice.

-   **Tool Limitations (`web_fetch`):**
    -   Discovered that `web_fetch` only supports `GET` requests, which limited direct testing of `POST` endpoints. This led to the adoption of `curl` via `run_shell_command` for testing `POST` requests.

**Implementation Details:**
-   Created `mcp-servers/` directory.
-   Initial `index.js` (later moved to `src/servers/cloudwatch-logs.js`) with `/logs` endpoint using `FilterLogEventsCommand`.

---

## 3. Feature: Listing Log Groups (`/log-groups` endpoint)

**User Request:** "Can you please list a few log groups from there so I know its working?" (after starting the initial server).

**Problem Identification:**
-   The initial `/logs` endpoint required a `logGroupName`, but there was no way to discover available log groups.
-   Initial attempts to list log groups revealed that `DescribeLogGroupsCommand` is paginated, meaning it doesn't return all results in a single call. This caused incomplete lists.

**Solution:**
-   Added a new `GET /log-groups` endpoint to `cloudwatch-logs.js`.
-   Implemented a `do...while` loop using `nextToken` with `DescribeLogGroupsCommand` to fetch all pages of log groups, ensuring a complete list.

---

## 4. Feature: Project Structure Refactoring (Multi-Server Support)

**User Request:** "I also would have more mcp servers in this mcp-servers directory. can we adjust the structure accordingly for this folder so it can be a project that would have many mcp servers and we can use the one needed."

**Design & Rationale:**
-   **Monorepo-like Structure:** Adopted a structure where `mcp-servers/` acts as a container for multiple, independent MCP server implementations.
-   **`src/servers/`:** Dedicated directory for individual server modules (e.g., `cloudwatch-logs.js`). Each module exports a `start()` function.
-   **`src/index.js` (Launcher):** A central entry point responsible for parsing command-line arguments (`node src/index.js <server-name>`) and dynamically importing/starting the specified server module.
-   **Shared Dependencies:** All server modules share a single `package.json` at the root, simplifying dependency management.

**Key Decisions & Challenges:**
-   **Git Repository Initialization:** Discovered that the `mcp-servers` directory itself was not a Git repository (only its sub-projects were). Had to initialize `git init` within `mcp-servers/`.
-   **`run_shell_command` `directory` parameter:** Faced initial confusion and errors with the `directory` parameter for `run_shell_command`, eventually resolving to run `git` commands from the root and specifying the `mcp-servers` path.

**Implementation Details:**
-   Created `src/` and `src/servers/` directories.
-   Moved `cloudwatch-logs.js` into `src/servers/`.
-   Created `src/index.js` for dynamic server loading.
-   Updated `package.json` with `start` scripts.
-   Initialized Git repo in `mcp-servers/`.
-   Created `README.md` and `AI_JOURNAL.md` for documentation.
-   Added `.gitignore` to exclude `node_modules`, `.env`, and `log_cache`.

---

## 5. Feature: Intelligent Log Caching (On-Demand & Atomic)

**User Request:** "download the log files locally for a few instances and then search from there instead of cloudways... Also we look for newer log files if available... don't want to redownload the logs from previous dates... store 2 months of logs at a time... only store the logs as and when needed avoiding a bulk download."

**Core Design & Rationale:**
-   **"Cache-on-Demand" Strategy:** Logs are downloaded and cached only when a search query requires them for a specific date range. This avoids unnecessary bulk downloads.
-   **Local Log Store (`log_cache/`):** A dedicated directory to persist downloaded logs, structured by log group and date (`log_cache/<sanitized_log_group_name>/YYYY-MM-DD.log`).
-   **`src/cache-manager.js`:** A new module created to encapsulate all caching-related logic, promoting modularity and reusability.

**Key Decisions & Challenges:**

-   **Atomic Cache Writes (Data Integrity):**
    -   **Problem:** Risk of incomplete or corrupted local log files due to interrupted downloads.
    -   **Initial User Suggestion:** Compare local file size with CloudWatch size.
    -   **My Analysis:** CloudWatch API does not provide pre-query size information.
    -   **Solution:** Implemented an "atomic write" pattern. Logs are first downloaded to a temporary file (`.log.tmp`). Only upon successful, complete download is the temporary file atomically renamed to its final `.log` name. This guarantees that the search function never reads an incomplete file. Any `.tmp` files found are considered corrupted and are deleted before a fresh download.

-   **Efficient Local Search:**
    -   `searchLocalLogs` function in `cache-manager.js` uses `fs.createReadStream` and `readline` to read log files line-by-line. This is crucial for memory efficiency when dealing with potentially large log files, avoiding loading the entire file into RAM.

-   **Automatic Pruning:**
    -   `pruneCache` function in `cache-manager.js` deletes log files older than `MAX_CACHE_AGE_DAYS` (60 days).
    -   This function is called once on server startup (`src/index.js`), ensuring disk space is managed.

-   **Unified Search Endpoint (`POST /search` Refactor):**
    -   The `/search` endpoint was completely refactored to orchestrate the caching logic.
    -   It determines required dates, checks for local cache presence, triggers `downloadAndCacheLogs` for missing data, and then uses `searchLocalLogs` on the consolidated set of local files.
    -   The old `GET /logs` and temporary `POST /cache-logs` endpoints were removed for API clarity.

-   **Logging Verbosity:**
    -   **User Feedback:** Initial verbose "Downloading..." logs caused flickering in the Gemini terminal.
    -   **My Fix:** Initially quieted down `downloadAndCacheLogs` and added concise "Cache miss" logs in `cloudwatch-logs.js`.
    -   **User Clarification:** The flickering was in *my* terminal (due to `curl`'s progress bar), not their server console.
    -   **Final Fix:** Reverted server-side logging to be verbose again (as per user's preference for their server console) and added the `-s` (silent) flag to `curl` commands executed by Gemini to suppress its progress output.

---

## 6. Git Management & Documentation

**Actions Taken:**
-   Regular Git commits to track progress.
-   Created `README.md` for project overview and usage instructions.
-   Updated `package.json` with author information (Viral Jetani) and MIT license.
-   Ensured `.gitignore` correctly excludes sensitive files (`.env`, `node_modules`, `log_cache`).

---

## 7. Future Considerations & Potential Improvements

-   **More Robust Error Handling:** Implement more granular error handling and logging, especially for AWS SDK calls and file system operations.
-   **Advanced Filtering:** Allow more complex filter patterns (e.g., JSON field filtering) directly in the search.
-   **Performance Optimization:** For extremely large log files, consider more advanced local search algorithms or indexing.
-   **Concurrency Limits:** Implement limits on concurrent CloudWatch download operations to avoid hitting AWS API rate limits for very broad searches.
-   **Configuration:** Externalize more configuration (e.g., `MAX_CACHE_AGE_DAYS`, port number) into a dedicated config file or environment variables.
-   **Testing:** Add unit and integration tests for the cache manager and server endpoints.
-   **Deployment:** Provide Docker Compose or Kubernetes manifests for easier deployment.
-   **Other Log Sources:** Extend the MCP server to support other log sources (e.g., S3, other cloud providers).

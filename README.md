# MCP Servers

This project is a collection of micro-servers designed to act as a secure proxy between the Gemini CLI and various cloud services, providing contextual data for debugging and analysis.

## Features

- **Scalable:** Easily add new servers for different services.
- **Secure:** Designed to not expose secrets, using AWS CLI profiles for authentication.
- **Centralized:** Manage all your MCP servers in one place.
- **Caching:** Intelligent local caching of CloudWatch logs for faster repeated searches.
- **Helper Scripts:** Command-line tools for easy log downloading and searching.

## Project Structure

```
mcp-servers/
├── .env
├── .gitignore
├── package.json
├── README.md
├── USAGE.md                    # Detailed usage guide for CloudWatch Logs server
├── download-logs.js            # Helper script to download logs
├── search-logs.js              # Helper script to search logs
├── log_cache/                  # Local cache directory (auto-created, gitignored)
└── src/
    ├── cache-manager.js        # Log caching and management utilities
    ├── index.js                # Main entry point
    └── servers/
        ├── cloudwatch-logs.js  # CloudWatch Logs server implementation
        └── ... (other servers)
```

- **`src/servers/`**: Contains the individual server implementations.
- **`src/index.js`**: The main entry point that launches the specified server.
- **`src/cache-manager.js`**: Shared utilities for caching CloudWatch logs locally.
- **`log_cache/`**: Directory where downloaded logs are cached (automatically created, excluded from git).

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or later)
- [AWS CLI](https://aws.amazon.com/cli/) configured with your credentials and at least one profile.

### Installation

1.  Clone the repository.
2.  Navigate to the project directory and install the dependencies:
    ```bash
    npm install
    ```

### Configuration

1.  Create a `.env` file in the root of the project.
2.  Add the AWS region you want to use:
    ```
    AWS_REGION=us-east-1
    ```

## How to Run a Server

You can run any server located in the `src/servers/` directory by passing its name as an argument to the `npm start` script.

For example, to run the `cloudwatch-logs` server:

```bash
AWS_PROFILE=your-profile-name npm start -- cloudwatch-logs
```

Replace `your-profile-name` with the name of the AWS profile you want to use.

For convenience, you can also use the pre-configured script in `package.json`:

```bash
AWS_PROFILE=your-profile-name npm run start:cloudwatch
```

The server will start on `http://localhost:4010` (or the port specified in `PORT_CLOUDWATCH_LOGS` environment variable).

## CloudWatch Logs Server

The CloudWatch Logs server provides a fast and efficient way to download and search AWS CloudWatch logs with local caching.

### Key Features

- **Download Endpoint**: Pre-download logs for faster searching
- **Search Endpoint**: Search cached logs with regex filtering
- **Local Caching**: Logs are cached locally by day for fast repeated searches
- **Automatic Pruning**: Old cached logs (>10 days) are automatically pruned on server startup
- **Helper Scripts**: Easy-to-use command-line tools for downloading and searching

### Quick Start

1. **Start the server:**
   ```bash
   AWS_PROFILE=your-profile-name npm run start:cloudwatch
   ```

2. **Download logs:**
   ```bash
   node download-logs.js "/aws/lambda/my-function" \
     --start "2024-11-28" \
     --end "2024-11-30"
   ```

3. **Search logs:**
   ```bash
   node search-logs.js "/aws/lambda/my-function" \
     --start "2024-11-28" \
     --filter "ERROR"
   ```

For detailed usage instructions, see [USAGE.md](./USAGE.md).

### Endpoints

- `GET /log-groups` - List all available CloudWatch log groups
- `POST /download` - Download logs from CloudWatch and cache locally
- `POST /search` - Search cached logs (downloads automatically if not cached)

## How to Add a New Server

1.  Create a new file in the `src/servers/` directory (e.g., `my-new-server.js`).
2.  The file must export a `start` function. For example:

    ```javascript
    export const start = () => {
      console.log('My new server is running!');
      // Add your server logic here
    };
    ```

3.  Run your new server with:

    ```bash
    npm start -- my-new-server
    ```

## Caching

The CloudWatch Logs server uses local file-based caching to improve performance:

- Logs are cached by day in the `log_cache/` directory
- Each log group gets its own sanitized directory name
- Logs older than 10 days are automatically pruned on server startup
- Cached logs are reused automatically by the search endpoint
- The cache directory is excluded from git (see `.gitignore`)

## Security

This project is designed to be safe to push to a public repository.

- The `.gitignore` file is configured to exclude:
  - `.env` file (contains AWS region configuration)
  - `node_modules/` directory
  - `log_cache/` directory (contains downloaded logs)
- The server code reads credentials from your local AWS profile and does not contain any hardcoded secrets.
- No actual log group names or sensitive data are included in example documentation.

**Never remove `.env` or `log_cache/` from the `.gitignore` file.**

# MCP Servers

This project is a collection of micro-servers designed to act as a secure proxy between the Gemini CLI and various cloud services, providing contextual data for debugging and analysis.

## Features

- **Scalable:** Easily add new servers for different services.
- **Secure:** Designed to not expose secrets, using AWS CLI profiles for authentication.
- **Centralized:** Manage all your MCP servers in one place.

## Project Structure

```
mcp-servers/
├── .env
├── .gitignore
├── package.json
└── src/
    ├── servers/
    │   ├── cloudwatch-logs.js
    │   └── ... (other servers)
    └── index.js
```

- **`src/servers/`**: Contains the individual server implementations.
- **`src/index.js`**: The main entry point that launches the specified server.

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

## Security

This project is designed to be safe to push to a public repository.

- The `.gitignore` file is configured to exclude the `.env` file and `node_modules`.
- The server code reads credentials from your local AWS profile and does not contain any hardcoded secrets.

**Never remove `.env` from the `.gitignore` file.**

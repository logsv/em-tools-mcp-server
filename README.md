# Engineering Manager Tools MCP Server

A Model Context Protocol (MCP) server for integrating engineering manager tools like Jira, Google Calendar, and Notion, designed to provide context to LLMs.

## Features

- **Jira Integration**: Manage tasks, projects, and issues
- **Google Calendar Integration**: Schedule and manage meetings
- **Notion Integration**: Access and manage documents and databases

## Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- Jira account with API access
- Google Cloud Platform account with Calendar API enabled
- Notion account with API access

## Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd em-tools-mcp-server
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file based on the `.env.example` file:
   ```bash
   cp .env.example .env
   ```

4. Update the `.env` file with your API credentials and configuration (optional, for local testing).

## Usage

### Starting the MCP Server

To start the MCP server, run:

```bash
npm start
```

The MCP server communicates via the MCP protocol and is designed to be connected by an MCP client or host application (e.g., an LLM application, Claude Desktop, or an IDE with MCP client capabilities).

---

## Connecting to the MCP Server

You can connect to the MCP server using either an official MCP client (like `npx mcp-remote`) or by making raw JSON-RPC requests (e.g., with `curl`).

### 1. Using npx mcp-remote (Recommended)

This is the easiest way to connect, list tools, and interact with the server:

```bash
npx mcp-remote http://localhost:3000/mcp
```
- This will automatically initialize a session, list available tools, and let you interact with them.
- You do **not** need to manually manage session IDs; the client handles it for you.

### 2. Using JSON-RPC (curl/manual)

If you want to interact directly (for scripting or debugging), follow these steps:

#### a. Initialize a session
```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'
```
- Copy the `mcp-session-id` from the response headers (if present) or from the response body if your client supports it.

#### b. List available tools
```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "mcp-session-id: <YOUR_SESSION_ID>" \
  -d '{"jsonrpc":"2.0","id":2,"method":"list_tools"}'
```

#### c. Authenticate (login) before using integration tools
- Use the login tool for the integration you want (e.g., Jira, Calendar, Notion).
- Example (Jira login):
```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "mcp-session-id: <YOUR_SESSION_ID>" \
  -d '{"jsonrpc":"2.0","id":3,"method":"get_login_jira","params":{"username":"<your-email>","apiToken":"<your-token>","host":"<your-jira-host>"}}'
```
- After login, you can use Jira tools in the same session.

> **Note:** If you call an integration tool/resource without logging in, you will receive a friendly error message prompting you to login first.

---

### Session-Based Flow (IMPORTANT)

- **All requests (including tool listing) require session initialization.**
- MCP clients (like `npx mcp-remote` or Claude Desktop) will automatically initialize a session and handle session IDs for you.
- If you use curl or a custom client, you must first initialize a session, then use the returned session ID for all subsequent requests.

### Login Flow for Integrations

- **Jira:** Use `get_login_jira` to authenticate. All Jira tools/resources require login.
- **Google Calendar:** Use `get_login_calendar` to authenticate. All Calendar tools/resources require login.
- **Notion:** Use `get_login_notion` to authenticate. All Notion tools/resources require login.
- If you call an integration tool/resource without logging in, you will receive a friendly error message prompting you to login first.

### Project Structure

```
├── src/
│   ├── index.js           # Main entry point for the MCP server
│   ├── services/          # Service implementations for external APIs
│   │   ├── jiraService.js
│   │   ├── calendarService.js
│   │   └── notionService.js
│   └── utils/             # Utility functions (e.g., logger)
├── .env                   # Environment variables
├── .env.example           # Example environment variables
└── package.json           # Project dependencies
```

## License

MIT
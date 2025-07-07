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

4. Update the `.env` file with your API credentials and configuration.

## API Credentials Setup

### Jira API

1. Log in to your Atlassian account
2. Go to Account Settings > Security > Create and manage API tokens
3. Create a new API token and copy it
4. Add your Jira host, email, and API token to the `.env` file

### Google Calendar API

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project
3. Enable the Google Calendar API
4. Create OAuth 2.0 credentials
5. Add the client ID, client secret, and redirect URI to the `.env` file

### Notion API

1. Go to [Notion Integrations](https://www.notion.so/my-integrations)
2. Create a new integration
3. Copy the API key
4. Add the API key to the `.env` file

## Usage

### Starting the MCP Server

To start the MCP server, run:

```bash
node src/index.js
```

The MCP server communicates via standard input/output (StdIO) and is designed to be connected by an MCP client or host application (e.g., an LLM application or an IDE with MCP client capabilities).

### Connecting with a Cloud Client (MCP Host)

To connect to this MCP server from a cloud-based MCP host or LLM application, you will typically need to:

1.  **Deploy the MCP Server**: Deploy this Node.js application to a cloud environment (e.g., AWS EC2, Google Cloud Run, Azure App Service, or a Kubernetes cluster). Ensure it's accessible from your MCP host.
2.  **Expose StdIO**: The MCP server uses StdIO for communication. In a cloud environment, this usually means running the server as a process that the MCP host can interact with via its standard input and output streams. The specific setup depends on the MCP host's capabilities and how it expects to connect to an external MCP server.
3.  **MCP Host Configuration**: Configure your MCP host application (e.g., Claude, an AI-powered IDE, or a custom LLM application) to connect to this server. This often involves specifying the server's executable path or a network endpoint if the MCP host supports network-based connections.

Refer to the documentation of your specific MCP host or LLM application for detailed instructions on connecting to an external MCP server.

### MCP Server Resources and Tools

This MCP server exposes the following resources and tools:

#### Jira

-   **Resource**: `jira://tasks/{taskId}`
    -   **Description**: Retrieve a specific Jira task by ID or list all tasks.
-   **Tool**: `create-jira-task`
    -   **Description**: Creates a new Jira task.
    -   **Input Schema**: `{ summary: string, description?: string, projectKey: string, issueType: string }`
-   **Tool**: `update-jira-task`
    -   **Description**: Updates an existing Jira task.
    -   **Input Schema**: `{ taskId: string, summary?: string, description?: string }`

#### Google Calendar

-   **Resource**: `calendar://meetings/{meetingId}`
    -   **Description**: Retrieve a specific calendar meeting by ID or list all meetings.
-   **Tool**: `create-calendar-meeting`
    -   **Description**: Creates a new calendar meeting.
    -   **Input Schema**: `{ summary: string, description?: string, startDateTime: string, endDateTime: string, attendees?: string[] }`

#### Notion

-   **Resource**: `notion://documents/{docId}`
    -   **Description**: Retrieve a specific Notion document by ID or list all documents.
-   **Tool**: `create-notion-document`
    -   **Description**: Creates a new Notion document.
    -   **Input Schema**: `{ title: string, parentId: string, content?: string }`

## Project Structure

```
├── src/
│   ├── index.js           # Main entry point for the MCP server
│   ├── mcpServer.js       # MCP server implementation with resource and tool registrations
│   ├── services/          # Service implementations for external APIs
│   │   ├── jiraService.js
│   │   ├── calendarService.js
│   │   └── notionService.js
│   └── utils/             # Utility functions (e.g., logger)
├── .env                   # Environment variables
├── .env.example          # Example environment variables
└── package.json          # Project dependencies
```

## License

MIT
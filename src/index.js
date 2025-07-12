import express from "express";
import { randomUUID } from "node:crypto";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import JiraService from './services/jiraService.js';
import CalendarService from './services/calendarService.js';
import NotionService from './services/notionService.js';
import logger from './utils/logger.js';
import { z } from 'zod';

const app = express();
app.use(express.json());

const transports = {};
const sessionStore = {};

function registerAllToolsAndResources(server) {
  // --- LOGIN TOOLS ---
  server.registerTool(
    'get_login_jira',
    {
      title: 'Login to Jira',
      description: 'Authenticate and get a Jira session token.',
      inputSchema: z.object({
        username: z.string(),
        apiToken: z.string(),
        host: z.string()
      }),
      outputSchema: z.object({ session: z.string() })
    },
    async ({ username, apiToken, host }, context) => {
      const session = Buffer.from(`${username}:${apiToken}:${host}`).toString('base64');
      sessionStore[context?.sessionId] = sessionStore[context?.sessionId] || {};
      sessionStore[context?.sessionId].jira = { username, apiToken, host, session };
      return { session };
    }
  );
  server.registerTool(
    'get_login_calendar',
    {
      title: 'Login to Google Calendar',
      description: 'Authenticate and get a Google Calendar session token.',
      inputSchema: z.object({
        clientId: z.string(),
        clientSecret: z.string(),
        redirectUri: z.string(),
        refreshToken: z.string().optional()
      }),
      outputSchema: z.object({ session: z.string() })
    },
    async ({ clientId, clientSecret, redirectUri, refreshToken }, context) => {
      const session = Buffer.from(`${clientId}:${clientSecret}:${redirectUri}:${refreshToken || ''}`).toString('base64');
      sessionStore[context?.sessionId] = sessionStore[context?.sessionId] || {};
      sessionStore[context?.sessionId].calendar = { clientId, clientSecret, redirectUri, refreshToken, session };
      return { session };
    }
  );
  server.registerTool(
    'get_login_notion',
    {
      title: 'Login to Notion',
      description: 'Authenticate and get a Notion session token.',
      inputSchema: z.object({
        apiKey: z.string()
      }),
      outputSchema: z.object({ session: z.string() })
    },
    async ({ apiKey }, context) => {
      const session = Buffer.from(`${apiKey}`).toString('base64');
      sessionStore[context?.sessionId] = sessionStore[context?.sessionId] || {};
      sessionStore[context?.sessionId].notion = { apiKey, session };
      return { session };
    }
  );

  // --- JIRA TOOLS/RESOURCES ---
  server.registerResource(
    'jira-tasks',
    new ResourceTemplate('jira://tasks/{taskId}', { list: undefined }),
    {
      title: 'Jira Task',
      description: 'Retrieve a specific Jira task or list all tasks.',
    },
    async (uri, { taskId }, context) => {
      const creds = sessionStore[context?.sessionId]?.jira;
      if (!creds) throw { code: -32001, message: "Please login to Jira first using the get_login_jira tool." };
      const jiraService = new JiraService(creds);
      if (taskId) {
        const task = await jiraService.getTask(taskId);
        return { contents: [{ uri: uri.href, text: JSON.stringify(task) }] };
      } else {
        const tasks = await jiraService.getTasks();
        return { contents: [{ uri: uri.href, text: JSON.stringify(tasks) }] };
      }
    }
  );
  server.registerTool(
    'create-jira-task',
    {
      title: 'Create Jira Task',
      description: 'Create a new task in Jira.',
      parameters: z.object({
        project_key: z.string().describe('The project key in Jira'),
        summary: z.string().describe('A brief summary of the task'),
        description: z.string().optional().describe('A detailed description of the task'),
        issue_type: z.string().default('Task').describe('The type of issue (e.g., Task, Bug, Story)'),
        assignee: z.string().optional().describe('Username of the assignee'),
        priority: z.string().optional().describe('Priority of the task'),
        due_date: z.string().optional().describe('Due date in YYYY-MM-DD format')
      }),
      returns: z.object({
        id: z.string().describe('The ID of the created task'),
        key: z.string().describe('The key of the created task'),
        self: z.string().describe('The URL to the created task')
      })
    },
    async (params, context) => {
      const creds = sessionStore[context?.sessionId]?.jira;
      if (!creds) throw { code: -32001, message: "Please login to Jira first using the get_login_jira tool." };
      const jiraService = new JiraService(creds);
      return jiraService.createTask(params);
    }
  );
  server.registerTool(
    'update-jira-task',
    {
      title: 'Update Jira Task',
      description: 'Updates an existing Jira task.',
      inputSchema: z.object({
        taskKey: z.string(),
        summary: z.string().optional(),
        description: z.string().optional(),
        status: z.string().optional(),
      }),
    },
    async ({ taskKey, summary, description, status }, context) => {
      const creds = sessionStore[context?.sessionId]?.jira;
      if (!creds) throw { code: -32001, message: "Please login to Jira first using the get_login_jira tool." };
      const jiraService = new JiraService(creds);
      return jiraService.updateTask(taskKey, { summary, description, status });
    }
  );

  // --- CALENDAR TOOLS/RESOURCES ---
  server.registerResource(
    'calendar-events',
    new ResourceTemplate('calendar://events/{eventId}', { list: undefined }),
    {
      title: 'Calendar Event',
      description: 'Retrieve a specific calendar event or list all events.',
    },
    async (uri, { eventId }, context) => {
      const creds = sessionStore[context?.sessionId]?.calendar;
      if (!creds) throw { code: -32002, message: "Please login to Calendar first using the get_login_calendar tool." };
      const calendarService = new CalendarService(creds);
      if (eventId) {
        const event = await calendarService.getEvent(eventId);
        return { contents: [{ uri: uri.href, text: JSON.stringify(event) }] };
      } else {
        const events = await calendarService.getEvents();
        return { contents: [{ uri: uri.href, text: JSON.stringify(events) }] };
      }
    }
  );
  server.registerTool(
    'create-calendar-meeting',
    {
      title: 'Create Calendar Meeting',
      description: 'Creates a new calendar meeting.',
      inputSchema: z.object({
        summary: z.string(),
        description: z.string().optional(),
        startDateTime: z.string(),
        endDateTime: z.string(),
        attendees: z.array(z.string().email()).optional(),
      }),
    },
    async ({ summary, description, startDateTime, endDateTime, attendees }, context) => {
      const creds = sessionStore[context?.sessionId]?.calendar;
      if (!creds) throw { code: -32002, message: "Please login to Calendar first using the get_login_calendar tool." };
      const calendarService = new CalendarService(creds);
      return calendarService.createMeeting(summary, description, startDateTime, endDateTime, attendees);
    }
  );

  // --- NOTION TOOLS/RESOURCES ---
  server.registerResource(
    'notion-documents',
    new ResourceTemplate('notion://documents/{docId}', { list: undefined }),
    {
      title: 'Notion Document',
      description: 'Retrieve a specific Notion document or list all documents.',
    },
    async (uri, { docId }, context) => {
      const creds = sessionStore[context?.sessionId]?.notion;
      if (!creds) throw { code: -32003, message: "Please login to Notion first using the get_login_notion tool." };
      const notionService = new NotionService(creds);
      if (docId) {
        const doc = await notionService.getDoc(docId);
        return { contents: [{ uri: uri.href, text: JSON.stringify(doc) }] };
      } else {
        const docs = await notionService.searchDocs();
        return { contents: [{ uri: uri.href, text: JSON.stringify(docs) }] };
      }
    }
  );
  server.registerTool(
    'create-notion-document',
    {
      title: 'Create Notion Document',
      description: 'Creates a new Notion document.',
      inputSchema: z.object({
        title: z.string(),
        parentId: z.string(),
        content: z.string().optional(),
      }),
    },
    async ({ title, parentId, content }, context) => {
      const creds = sessionStore[context?.sessionId]?.notion;
      if (!creds) throw { code: -32003, message: "Please login to Notion first using the get_login_notion tool." };
      const notionService = new NotionService(creds);
      return notionService.createDoc(title, parentId, content);
    }
  );
}

app.post('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] || req.headers['mcp-session-id'.toLowerCase()];
  let transport;

  if (sessionId && transports[sessionId]) {
    transport = transports[sessionId];
  } else if (!sessionId && isInitializeRequest(req.body)) {
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sid) => {
        transports[sid] = transport;
      },
    });
    transport.onclose = () => {
      if (transport.sessionId) {
        delete transports[transport.sessionId];
        delete sessionStore[transport.sessionId];
      }
    };
    const server = new McpServer({
      name: "em-tools-mcp-server",
      version: "1.0.0"
    });
    registerAllToolsAndResources(server);
    await server.connect(transport);
  } else {
    res.status(400).json({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Bad Request: No valid session ID provided',
      },
      id: null,
    });
    return;
  }

  await transport.handleRequest(req, res, req.body);
});

app.get('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] || req.headers['mcp-session-id'.toLowerCase()];
  if (!sessionId || !transports[sessionId]) {
    res.status(400).send('Invalid or missing session ID');
    return;
  }
  const transport = transports[sessionId];
  await transport.handleRequest(req, res);
});

app.delete('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] || req.headers['mcp-session-id'.toLowerCase()];
  if (!sessionId || !transports[sessionId]) {
    res.status(400).send('Invalid or missing session ID');
    return;
  }
  const transport = transports[sessionId];
  await transport.handleRequest(req, res);
});

app.listen(3000, () => {
  logger.info('MCP Server live at http://localhost:3000/mcp');
});
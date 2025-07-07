import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';

import JiraService from './services/jiraService.js';
import CalendarService from './services/calendarService.js';
import NotionService from './services/notionService.js';
import logger from './utils/logger.js';

class MCPServer {
    constructor() {
        this.port = Number(process.env.PORT) || 3000;
        this.server = new McpServer({
            name: 'mcp-integration-server',
            version: '1.0.0',
        });

        try {
            this.jiraService = new JiraService();
            logger.info('Jira service initialized successfully');
        } catch (error) {
            logger.warn(`Failed to initialize Jira service: ${error.message}`);
            this.jiraService = null;
        }

        try {
            this.calendarService = new CalendarService();
            logger.info('Calendar service initialized successfully');
        } catch (error) {
            logger.warn(`Failed to initialize Calendar service: ${error.message}`);
            this.calendarService = null;
        }

        this.notionService = new NotionService();

        this.registerResourcesAndTools();
    }

    registerResourcesAndTools() {
        // Jira Resources and Tools - only register if service is available
        if (this.jiraService) {
            this.server.registerResource(
                'jira-tasks',
                new ResourceTemplate('jira://tasks/{taskId}', { list: undefined }),
                {
                    title: 'Jira Task',
                    description: 'Retrieve a specific Jira task or list all tasks.',
                },
                async (uri, { taskId }) => {
                    try {
                        if (taskId) {
                            const task = await this.jiraService.getTask(taskId);
                            return { contents: [{ uri: uri.href, text: JSON.stringify(task) }] };
                        } else {
                            const tasks = await this.jiraService.getTasks();
                            return { contents: [{ uri: uri.href, text: JSON.stringify(tasks) }] };
                        }
                    } catch (error) {
                        logger.error(`Error fetching Jira task(s): ${error.message}`);
                        throw new Error(`Failed to fetch Jira task(s): ${error.message}`);
                    }
                }
            );
        } else {
            logger.info('Jira service not available, skipping Jira resources registration');
        }

        if (this.jiraService) {
            this.server.registerTool(
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
                async (params) => {
                    try {
                        const task = await this.jiraService.createTask(params);
                        return task;
                    } catch (error) {
                        logger.error(`Error creating Jira task: ${error.message}`);
                        throw new Error(`Failed to create Jira task: ${error.message}`);
                    }
                }
            );
        }

        if (this.jiraService) {
            this.server.registerTool(
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
                async ({ taskKey, summary, description, status }) => {
                    try {
                        await this.jiraService.updateTask(taskKey, { summary, description, status });
                        return { content: [{ type: 'text', text: `Task ${taskKey} updated successfully` }] };
                    } catch (error) {
                        logger.error(`Error updating Jira task: ${error.message}`);
                        throw new Error(`Failed to update Jira task: ${error.message}`);
                    }
                }
            );
        }

        // Calendar Resources and Tools - only register if service is available
        if (this.calendarService) {
            this.server.registerResource(
                'calendar-events',
                new ResourceTemplate('calendar://events/{eventId}', { list: undefined }),
                {
                    title: 'Calendar Event',
                    description: 'Retrieve a specific calendar event or list all events.',
                },
                async (uri, { eventId }) => {
                    try {
                        if (eventId) {
                            const event = await this.calendarService.getEvent(eventId);
                            return { contents: [{ uri: uri.href, text: JSON.stringify(event) }] };
                        } else {
                            const events = await this.calendarService.getEvents();
                            return { contents: [{ uri: uri.href, text: JSON.stringify(events) }] };
                        }
                    } catch (error) {
                        logger.error(`Error fetching calendar event(s): ${error.message}`);
                        throw new Error(`Failed to fetch calendar event(s): ${error.message}`);
                    }
                }
            );
        } else {
            logger.info('Calendar service not available, skipping Calendar resources registration');
        }

        if (this.calendarService) {
            this.server.registerTool(
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
                async ({ summary, description, startDateTime, endDateTime, attendees }) => {
                    try {
                        const newMeeting = await this.calendarService.createMeeting(summary, description, startDateTime, endDateTime, attendees);
                        return { content: [{ type: 'text', text: `Meeting created: ${newMeeting.id}` }] };
                    } catch (error) {
                        logger.error(`Error creating calendar meeting: ${error.message}`);
                        throw new Error(`Failed to create calendar meeting: ${error.message}`);
                    }
                }
            );
        }

        // Notion Resources and Tools - only register if service is available
        if (this.notionService && typeof this.notionService.getDoc === 'function' && typeof this.notionService.searchDocs === 'function') {
            this.server.registerResource(
                'notion-documents',
                new ResourceTemplate('notion://documents/{docId}', { list: undefined }),
                {
                    title: 'Notion Document',
                    description: 'Retrieve a specific Notion document or list all documents.',
                },
                async (uri, { docId }) => {
                    try {
                        if (docId) {
                            const doc = await this.notionService.getDoc(docId);
                            return { contents: [{ uri: uri.href, text: JSON.stringify(doc) }] };
                        } else {
                            const docs = await this.notionService.searchDocs();
                            return { contents: [{ uri: uri.href, text: JSON.stringify(docs) }] };
                        }
                    } catch (error) {
                        logger.error(`Error fetching Notion document(s): ${error.message}`);
                        throw new Error(`Failed to fetch Notion document(s): ${error.message}`);
                    }
                }
            );
        } else {
            logger.info('Notion service not available or incomplete, skipping Notion resources registration');
        }

        this.server.registerTool(
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
            async ({ title, parentId, content }) => {
                try {
                    const newDoc = await this.notionService.createDoc(title, parentId, content);
                    return { content: [{ type: 'text', text: `Document created: ${newDoc.id}` }] };
                } catch (error) {
                    logger.error(`Error creating Notion document: ${error.message}`);
                    throw new Error(`Failed to create Notion document: ${error.message}`);
                }
            }
        );
    }

    async start() {
        logger.info('Starting MCP Server...');
        const stdio = new StdioServerTransport();
        await this.server.connect(stdio);
        logger.info('MCP Server connected via StdIO.');

        const http = new StreamableHTTPServerTransport({ port: this.port });
        await this.server.connect(http);
        logger.info(`MCP Server live at http://localhost:${this.port}`);
    }
}

export default MCPServer;
const { McpServer, ResourceTemplate } = require('@modelcontextprotocol/sdk/server/mcp');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio');
const { z } = require('zod');

const JiraService = require('./services/jiraService');
const CalendarService = require('./services/calendarService');
const NotionService = require('./services/notionService');
const logger = require('./utils/logger');

class MCPServer {
    constructor() {
        this.server = new McpServer({
            name: 'mcp-integration-server',
            version: '1.0.0',
        });

        this.jiraService = new JiraService();
        this.calendarService = new CalendarService();
        this.notionService = new NotionService();

        this.registerResourcesAndTools();
    }

    registerResourcesAndTools() {
        // Jira Resources and Tools
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

        this.server.registerTool(
            'create-jira-task',
            {
                title: 'Create Jira Task',
                description: 'Creates a new Jira task.',
                inputSchema: z.object({
                    summary: z.string(),
                    description: z.string().optional(),
                    projectKey: z.string(),
                    issueType: z.string(),
                }),
            },
            async ({ summary, description, projectKey, issueType }) => {
                try {
                    const newTask = await this.jiraService.createTask(summary, description, projectKey, issueType);
                    return { content: [{ type: 'text', text: `Task created: ${newTask.key}` }] };
                } catch (error) {
                    logger.error(`Error creating Jira task: ${error.message}`);
                    throw new Error(`Failed to create Jira task: ${error.message}`);
                }
            }
        );

        this.server.registerTool(
            'update-jira-task',
            {
                title: 'Update Jira Task',
                description: 'Updates an existing Jira task.',
                inputSchema: z.object({
                    taskId: z.string(),
                    summary: z.string().optional(),
                    description: z.string().optional(),
                }),
            },
            async ({ taskId, summary, description }) => {
                try {
                    await this.jiraService.updateTask(taskId, summary, description);
                    return { content: [{ type: 'text', text: `Task ${taskId} updated successfully.` }] };
                } catch (error) {
                    logger.error(`Error updating Jira task: ${error.message}`);
                    throw new Error(`Failed to update Jira task: ${error.message}`);
                }
            }
        );

        // Calendar Resources and Tools
        this.server.registerResource(
            'calendar-meetings',
            new ResourceTemplate('calendar://meetings/{meetingId}', { list: undefined }),
            {
                title: 'Calendar Meeting',
                description: 'Retrieve a specific calendar meeting or list all meetings.',
            },
            async (uri, { meetingId }) => {
                try {
                    if (meetingId) {
                        const meeting = await this.calendarService.getMeeting(meetingId);
                        return { contents: [{ uri: uri.href, text: JSON.stringify(meeting) }] };
                    } else {
                        const meetings = await this.calendarService.getMeetings();
                        return { contents: [{ uri: uri.href, text: JSON.stringify(meetings) }] };
                    }
                } catch (error) {
                    logger.error(`Error fetching calendar meeting(s): ${error.message}`);
                    throw new Error(`Failed to fetch calendar meeting(s): ${error.message}`);
                }
            }
        );

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

        // Notion Resources and Tools
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
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        logger.info('MCP Server started and connected via StdIO.');
    }
}

module.exports = MCPServer;
import JiraClient from 'jira-client';
import logger from '../utils/logger.js';
import { NotFoundError, AuthenticationError, ValidationError, CustomError } from '../utils/errors.js';
import { z } from 'zod';

// Define schemas for input validation
const CreateJiraTaskSchema = z.object({
  project_key: z.string().min(1, "Project key cannot be empty"),
  summary: z.string().min(1, "Summary cannot be empty"),
  description: z.string().optional(),
  issue_type: z.string().default('Task'),
  assignee: z.string().optional(),
  priority: z.string().optional(),
  due_date: z.string().optional() // Assuming YYYY-MM-DD format
});

const UpdateJiraTaskSchema = z.object({
  summary: z.string().min(1, "Summary cannot be empty").optional(),
  description: z.string().optional(),
  status: z.string().optional(),
  assignee: z.string().optional(),
  priority: z.string().optional(),
  due_date: z.string().optional() // Assuming YYYY-MM-DD format
}).refine(data => Object.keys(data).length > 0, { message: "At least one field must be provided for update" });

class JiraService {
  constructor() {
    const { JIRA_HOST, JIRA_USERNAME, JIRA_API_TOKEN, NODE_ENV } = process.env;

    if (!JIRA_HOST || !JIRA_USERNAME || !JIRA_API_TOKEN) {
      logger.warn('Jira API credentials not provided.');
      
      // In development mode, continue without throwing an error
      if (NODE_ENV === 'development') {
        logger.info('Running in development mode without Jira credentials');
        this.client = null;
        return;
      } else {
        throw new AuthenticationError('Jira API credentials not provided.');
      }
    }

    this.client = new JiraClient({
      protocol: 'https',
      host: JIRA_HOST,
      username: JIRA_USERNAME,
      password: JIRA_API_TOKEN,
      apiVersion: '2',
      strictSSL: true
    });
    logger.info('Jira client initialized successfully');
  }

  /**
   * Get tasks from Jira with optional filters
   * @param {string} project - Project key
   * @param {string} status - Status name
   * @param {string} assignee - Assignee username
   * @param {number} maxResults - Maximum number of results to return
   * @returns {Promise<Array>} - Array of tasks
   */
  async getTasks(project, status, assignee, maxResults = 50) {
    try {
      // Build JQL query
      const jqlParts = [];
      
      if (project) {
        jqlParts.push(`project = ${project}`);
      }
      
      if (status) {
        jqlParts.push(`status = "${status}"`);
      }
      
      if (assignee) {
        if (assignee.toLowerCase() === 'currentuser') {
          jqlParts.push('assignee = currentUser()');
        } else {
          jqlParts.push(`assignee = "${assignee}"`);
        }
      }
      
      const jql = jqlParts.length > 0 ? jqlParts.join(' AND ') : '';
      
      // Execute query
      const issues = await this.client.searchJira(jql, {
        maxResults,
        fields: ['summary', 'description', 'status', 'assignee', 'priority', 'created', 'updated', 'duedate']
      });
      
      // Format response
      return {
        tasks: issues.issues.map(this._formatIssue),
        total: issues.total
      };
    } catch (error) {
      logger.error(error);
      if (error.statusCode === 401) {
        throw new AuthenticationError('Failed to authenticate with Jira. Check your credentials.');
      } else if (error.statusCode === 404) {
        throw new NotFoundError('Jira resource not found.');
      } else {
        throw new CustomError(`Error getting Jira tasks: ${error.message}`, error.statusCode);
      }
    }
  }

  /**
   * Get a specific task by ID
   * @param {string} taskId - Task ID or key
   * @returns {Promise<Object>} - Task object
   */
  async getTask(taskId) {
    try {
      const issue = await this.client.findIssue(taskId, {
        fields: ['summary', 'description', 'status', 'assignee', 'priority', 'created', 'updated', 'duedate']
      });
      return this._formatIssue(issue);
    } catch (error) {
      logger.error(error);
      if (error.statusCode === 401) {
        throw new AuthenticationError('Failed to authenticate with Jira. Check your credentials.');
      } else if (error.statusCode === 404) {
        throw new NotFoundError(`Jira task with ID ${taskId} not found.`);
      } else {
        throw new CustomError(`Error getting Jira task: ${error.message}`, error.statusCode);
      }
    }
  }

  /**
   * Create a new task
   * @param {Object} taskData - Task data
   * @returns {Promise<Object>} - Created task
   */
  async createTask(taskData) {
    try {
      const validatedData = CreateJiraTaskSchema.parse(taskData);

      const { project_key, summary, description, issue_type, assignee, priority, due_date } = validatedData;
      
      const issueData = {
        fields: {
          project: {
            key: project_key
          },
          summary,
          description,
          issuetype: {
            name: issue_type
          }
        }
      };
      
      if (assignee) {
        issueData.fields.assignee = { name: assignee };
      }
      
      if (priority) {
        issueData.fields.priority = { name: priority };
      }
      
      if (due_date) {
        issueData.fields.duedate = due_date;
      }
      
      const issue = await this.client.addNewIssue(issueData);
      return await this.getTask(issue.key);
    } catch (error) {
      logger.error(error);
      if (error instanceof z.ZodError) {
        throw new ValidationError(`Invalid input for creating Jira task: ${error.errors.map(e => e.message).join(', ')}`);
      } else if (error.statusCode === 401) {
        throw new AuthenticationError('Failed to authenticate with Jira. Check your credentials.');
      } else if (error.statusCode === 400) {
        throw new ValidationError('Invalid request to Jira API. Check provided data.');
      } else {
        throw new CustomError(`Error creating Jira task: ${error.message}`, error.statusCode);
      }
    }
  }

  /**
   * Update an existing task
   * @param {string} taskId - Task ID or key
   * @param {Object} taskData - Task data to update
   * @returns {Promise<Object>} - Updated task
   */
  async updateTask(taskId, taskData) {
    try {
      const validatedData = UpdateJiraTaskSchema.parse(taskData);
      const { summary, description, status, assignee, priority, due_date } = validatedData;
      
      const issueData = {
        fields: {}
      };
      
      if (summary) {
        issueData.fields.summary = summary;
      }
      
      if (description) {
        issueData.fields.description = description;
      }
      
      if (assignee) {
        issueData.fields.assignee = { name: assignee };
      }
      
      if (priority) {
        issueData.fields.priority = { name: priority };
      }
      
      if (due_date) {
        issueData.fields.duedate = due_date;
      }
      
      if (Object.keys(issueData.fields).length > 0) {
        await this.client.updateIssue(taskId, issueData);
      }
      
      // Handle status transition if provided
      if (status) {
        const transitions = await this.client.listTransitions(taskId);
        const transition = transitions.transitions.find(t => t.name.toLowerCase() === status.toLowerCase());
        
        if (transition) {
          await this.client.transitionIssue(taskId, {
            transition: { id: transition.id }
          });
        } else {
          logger.warn(`Status transition '${status}' not available for issue ${taskId}`);
        }
      }
      
      return await this.getTask(taskId);
    } catch (error) {
      logger.error(error);
      if (error instanceof z.ZodError) {
        throw new ValidationError(`Invalid input for updating Jira task: ${error.errors.map(e => e.message).join(', ')}`);
      } else if (error.statusCode === 401) {
        throw new AuthenticationError('Failed to authenticate with Jira. Check your credentials.');
      } else if (error.statusCode === 404) {
        throw new NotFoundError(`Jira task with ID ${taskId} not found.`);
      } else if (error.statusCode === 400) {
        throw new ValidationError('Invalid request to Jira API. Check provided data.');
      } else {
        throw new CustomError(`Error updating Jira task: ${error.message}`, error.statusCode);
      }
    }
  }

  /**
   * Get all projects
   * @returns {Promise<Array>} - Array of projects
   */
  async getProjects() {
    try {
      const projects = await this.client.listProjects();
      return projects.map(project => ({
        id: project.id,
        key: project.key,
        name: project.name
      }));
    } catch (error) {
      logger.error(error);
      if (error.statusCode === 401) {
        throw new AuthenticationError('Failed to authenticate with Jira. Check your credentials.');
      } else {
        throw new CustomError(`Error getting Jira projects: ${error.message}`, error.statusCode);
      }
    }
  }

  /**
   * Get all issue types
   * @returns {Promise<Array>} - Array of issue types
   */
  async getIssueTypes() {
    try {
      const issueTypes = await this.client.listIssueTypes();
      return issueTypes.map(issueType => ({
        id: issueType.id,
        name: issueType.name,
        description: issueType.description
      }));
    } catch (error) {
      logger.error(error);
      if (error.statusCode === 401) {
        throw new AuthenticationError('Failed to authenticate with Jira. Check your credentials.');
      } else {
        throw new CustomError(`Error getting Jira issue types: ${error.message}`, error.statusCode);
      }
    }
  }

  /**
   * Get all priorities
   * @returns {Promise<Array>} - Array of priorities
   */
  async getPriorities() {
    try {
      const priorities = await this.client.getPriorities();
      return priorities.map(priority => ({
        id: priority.id,
        name: priority.name,
        description: priority.description
      }));
    } catch (error) {
      logger.error(error);
      if (error.statusCode === 401) {
        throw new AuthenticationError('Failed to authenticate with Jira. Check your credentials.');
      } else {
        throw new CustomError(`Error getting Jira priorities: ${error.message}`, error.statusCode);
      }
    }
  }

  /**
   * Format Jira issue to standardized response
   * @param {Object} issue - Jira issue
   * @returns {Object} - Formatted task
   * @private
   */
  _formatIssue(issue) {
    return {
      id: issue.id,
      key: issue.key,
      summary: issue.fields.summary,
      description: issue.fields.description,
      status: issue.fields.status ? issue.fields.status.name : null,
      assignee: issue.fields.assignee ? issue.fields.assignee.displayName : null,
      priority: issue.fields.priority ? issue.fields.priority.name : null,
      created: issue.fields.created,
      updated: issue.fields.updated,
      due_date: issue.fields.duedate
    };
  }
}

export default JiraService;
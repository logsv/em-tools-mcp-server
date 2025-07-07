const JiraClient = require('jira-client');
const logger = require('../utils/logger');

class JiraService {
  constructor() {
    try {
      this.client = new JiraClient({
        protocol: 'https',
        host: process.env.JIRA_HOST,
        username: process.env.JIRA_USERNAME,
        password: process.env.JIRA_API_TOKEN,
        apiVersion: '2',
        strictSSL: true
      });
      logger.info('Jira client initialized successfully');
    } catch (error) {
      logger.error(`Failed to initialize Jira client: ${error.message}`);
      throw error;
    }
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
      logger.error(`Error getting Jira tasks: ${error.message}`);
      throw error;
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
      logger.error(`Error getting Jira task: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create a new task
   * @param {Object} taskData - Task data
   * @returns {Promise<Object>} - Created task
   */
  async createTask(taskData) {
    try {
      const { project_key, summary, description, issue_type = 'Task', assignee, priority, due_date } = taskData;
      
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
      logger.error(`Error creating Jira task: ${error.message}`);
      throw error;
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
      const { summary, description, status, assignee, priority, due_date } = taskData;
      
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
      
      await this.client.updateIssue(taskId, issueData);
      
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
      logger.error(`Error updating Jira task: ${error.message}`);
      throw error;
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
      logger.error(`Error getting Jira projects: ${error.message}`);
      throw error;
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

module.exports = JiraService;
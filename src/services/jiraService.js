import JiraClient from 'jira-client';
import logger from '../utils/logger.js';
import { AuthenticationError } from '../utils/errors.js';

class JiraService {
  constructor() {
    const { JIRA_HOST, JIRA_USERNAME, JIRA_API_TOKEN } = process.env;
    if (!JIRA_HOST || !JIRA_USERNAME || !JIRA_API_TOKEN) {
      logger.warn('Jira API credentials not provided.');
      this.client = null;
      return;
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

  async getTask(taskId) {
    if (!this.client) return {};
    try {
      return await this.client.findIssue(taskId);
    } catch (error) {
      logger.error(error);
      return {};
    }
  }

  async getTasks() {
    if (!this.client) return [];
    try {
      const result = await this.client.searchJira(''); // You may want to customize the JQL
      return result.issues || [];
    } catch (error) {
      logger.error(error);
      return [];
    }
  }

  async createTask(params) {
    if (!this.client) return {};
    try {
      return await this.client.addNewIssue({
        fields: {
          project: { key: params.project_key },
          summary: params.summary,
          description: params.description,
          issuetype: { name: params.issue_type || 'Task' },
          assignee: params.assignee ? { name: params.assignee } : undefined,
          priority: params.priority ? { name: params.priority } : undefined,
          duedate: params.due_date || undefined
        }
      });
    } catch (error) {
      logger.error(error);
      return {};
    }
  }

  async updateTask(taskKey, { summary, description, status }) {
    if (!this.client) return {};
    try {
      const fields = {};
      if (summary) fields.summary = summary;
      if (description) fields.description = description;
      // Status update may require a transition, not just a field update
      await this.client.updateIssue(taskKey, { fields });
      if (status) {
        // Find the transition ID for the desired status
        const transitions = await this.client.listTransitions(taskKey);
        const transition = transitions.transitions.find(t => t.to.name === status);
        if (transition) {
          await this.client.transitionIssue(taskKey, { transition: { id: transition.id } });
        }
      }
      return { id: taskKey, summary, description, status };
    } catch (error) {
      logger.error(error);
      return {};
    }
  }
}

export default JiraService; 
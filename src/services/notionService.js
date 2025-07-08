import { Client as NotionClient } from '@notionhq/client';
import logger from '../utils/logger.js';
import { AuthenticationError } from '../utils/errors.js';

class NotionService {
  constructor() {
    const { NOTION_API_KEY } = process.env;
    if (!NOTION_API_KEY) {
      logger.warn('Notion API key not provided.');
      this.client = null;
      return;
    }
    this.client = new NotionClient({ auth: NOTION_API_KEY });
    logger.info('NotionService initialized');
  }

  async getDoc(docId) {
    if (!this.client) return {};
    try {
      const page = await this.client.pages.retrieve({ page_id: docId });
      return page;
    } catch (error) {
      logger.error(error);
      return {};
    }
  }

  async searchDocs() {
    if (!this.client) return [];
    try {
      const res = await this.client.search({});
      return res.results || [];
    } catch (error) {
      logger.error(error);
      return [];
    }
  }

  async createDoc(title, parentId, content) {
    if (!this.client) return {};
    try {
      const response = await this.client.pages.create({
        parent: { database_id: parentId },
        properties: {
          title: [
            {
              text: {
                content: title,
              },
            },
          ],
        },
        // Notion API for content is more complex; this is a minimal example
      });
      return response;
    } catch (error) {
      logger.error(error);
      return {};
    }
  }
}

export default NotionService; 
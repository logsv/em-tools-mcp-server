const { Client } = require('@notionhq/client');
const logger = require('../utils/logger');

class NotionService {
  constructor() {
    try {
      this.client = new Client({
        auth: process.env.NOTION_API_KEY,
      });
      logger.info('Notion client initialized successfully');
    } catch (error) {
      logger.error(`Failed to initialize Notion client: ${error.message}`);
      throw error;
    }
  }

  /**
   * Search for documents in Notion
   * @param {string} query - Search query
   * @param {string} databaseId - Database ID to search in
   * @param {number} pageSize - Number of results per page
   * @returns {Promise<Object>} - Search results
   */
  async searchDocs(query, databaseId, pageSize = 10) {
    try {
      const searchParams = {
        page_size: pageSize
      };
      
      if (query) {
        searchParams.query = query;
      }
      
      if (databaseId) {
        // If database ID is provided, use database query instead of search
        const response = await this.client.databases.query({
          database_id: databaseId,
          page_size: pageSize
        });
        
        return {
          docs: response.results.map(this._formatPage),
          next_cursor: response.next_cursor,
          has_more: response.has_more
        };
      } else {
        // Otherwise use global search
        const response = await this.client.search(searchParams);
        
        return {
          docs: response.results.map(this._formatPage),
          next_cursor: response.next_cursor,
          has_more: response.has_more
        };
      }
    } catch (error) {
      logger.error(`Error searching Notion docs: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get a specific document by ID
   * @param {string} docId - Document ID
   * @returns {Promise<Object>} - Document object
   */
  async getDoc(docId) {
    try {
      const page = await this.client.pages.retrieve({ page_id: docId });
      const blocks = await this.client.blocks.children.list({ block_id: docId });
      
      const formattedPage = this._formatPage(page);
      formattedPage.content = blocks.results;
      
      return formattedPage;
    } catch (error) {
      logger.error(`Error getting Notion doc: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create a new document
   * @param {Object} docData - Document data
   * @returns {Promise<Object>} - Created document
   */
  async createDoc(docData) {
    try {
      const { database_id, title, properties, content } = docData;
      
      if (!database_id) {
        throw new Error('Database ID is required');
      }
      
      // Prepare page properties
      const pageProperties = {};
      
      // Add title property
      if (title) {
        pageProperties['Name'] = {
          title: [
            {
              text: {
                content: title
              }
            }
          ]
        };
      }
      
      // Add other properties if provided
      if (properties && typeof properties === 'object') {
        Object.keys(properties).forEach(key => {
          const value = properties[key];
          
          // Handle different property types
          if (typeof value === 'string') {
            pageProperties[key] = {
              rich_text: [
                {
                  text: {
                    content: value
                  }
                }
              ]
            };
          } else if (typeof value === 'number') {
            pageProperties[key] = {
              number: value
            };
          } else if (value instanceof Date) {
            pageProperties[key] = {
              date: {
                start: value.toISOString()
              }
            };
          } else if (Array.isArray(value)) {
            pageProperties[key] = {
              multi_select: value.map(item => ({ name: item }))
            };
          } else if (typeof value === 'boolean') {
            pageProperties[key] = {
              checkbox: value
            };
          }
        });
      }
      
      // Create the page
      const page = await this.client.pages.create({
        parent: {
          database_id: database_id
        },
        properties: pageProperties
      });
      
      // Add content blocks if provided
      if (content && Array.isArray(content)) {
        await this._addContentBlocks(page.id, content);
      }
      
      return await this.getDoc(page.id);
    } catch (error) {
      logger.error(`Error creating Notion doc: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update an existing document
   * @param {string} docId - Document ID
   * @param {Object} docData - Document data to update
   * @returns {Promise<Object>} - Updated document
   */
  async updateDoc(docId, docData) {
    try {
      const { title, properties, content } = docData;
      
      // Prepare page properties
      const pageProperties = {};
      
      // Update title property
      if (title) {
        pageProperties['Name'] = {
          title: [
            {
              text: {
                content: title
              }
            }
          ]
        };
      }
      
      // Update other properties if provided
      if (properties && typeof properties === 'object') {
        Object.keys(properties).forEach(key => {
          const value = properties[key];
          
          // Handle different property types
          if (typeof value === 'string') {
            pageProperties[key] = {
              rich_text: [
                {
                  text: {
                    content: value
                  }
                }
              ]
            };
          } else if (typeof value === 'number') {
            pageProperties[key] = {
              number: value
            };
          } else if (value instanceof Date) {
            pageProperties[key] = {
              date: {
                start: value.toISOString()
              }
            };
          } else if (Array.isArray(value)) {
            pageProperties[key] = {
              multi_select: value.map(item => ({ name: item }))
            };
          } else if (typeof value === 'boolean') {
            pageProperties[key] = {
              checkbox: value
            };
          }
        });
      }
      
      // Update the page
      await this.client.pages.update({
        page_id: docId,
        properties: pageProperties
      });
      
      // Update content blocks if provided
      if (content && Array.isArray(content)) {
        // First, delete existing blocks
        await this._deleteAllBlocks(docId);
        
        // Then add new blocks
        await this._addContentBlocks(docId, content);
      }
      
      return await this.getDoc(docId);
    } catch (error) {
      logger.error(`Error updating Notion doc: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get all databases
   * @returns {Promise<Array>} - Array of databases
   */
  async getDatabases() {
    try {
      const response = await this.client.search({
        filter: {
          property: 'object',
          value: 'database'
        }
      });
      
      return response.results.map(database => ({
        id: database.id,
        title: this._extractTitle(database),
        properties: database.properties
      }));
    } catch (error) {
      logger.error(`Error getting Notion databases: ${error.message}`);
      throw error;
    }
  }

  /**
   * Format Notion page to standardized response
   * @param {Object} page - Notion page
   * @returns {Object} - Formatted document
   * @private
   */
  _formatPage(page) {
    const formattedPage = {
      id: page.id,
      title: this._extractTitle(page),
      url: page.url,
      created_time: page.created_time,
      last_edited_time: page.last_edited_time,
      properties: {}
    };
    
    // Extract properties
    if (page.properties) {
      Object.keys(page.properties).forEach(key => {
        const property = page.properties[key];
        
        switch (property.type) {
          case 'title':
            formattedPage.properties[key] = property.title.map(t => t.plain_text).join('');
            break;
          case 'rich_text':
            formattedPage.properties[key] = property.rich_text.map(t => t.plain_text).join('');
            break;
          case 'number':
            formattedPage.properties[key] = property.number;
            break;
          case 'select':
            formattedPage.properties[key] = property.select?.name || null;
            break;
          case 'multi_select':
            formattedPage.properties[key] = property.multi_select.map(item => item.name);
            break;
          case 'date':
            formattedPage.properties[key] = property.date;
            break;
          case 'checkbox':
            formattedPage.properties[key] = property.checkbox;
            break;
          case 'url':
            formattedPage.properties[key] = property.url;
            break;
          case 'email':
            formattedPage.properties[key] = property.email;
            break;
          case 'phone_number':
            formattedPage.properties[key] = property.phone_number;
            break;
          default:
            // For other property types, store as is
            formattedPage.properties[key] = property;
        }
      });
    }
    
    return formattedPage;
  }

  /**
   * Extract title from Notion page or database
   * @param {Object} obj - Notion page or database
   * @returns {string} - Title
   * @private
   */
  _extractTitle(obj) {
    // For databases
    if (obj.title) {
      return obj.title.map(t => t.plain_text).join('');
    }
    
    // For pages
    if (obj.properties) {
      // Find title property
      const titleProp = Object.values(obj.properties).find(prop => prop.type === 'title');
      if (titleProp && titleProp.title) {
        return titleProp.title.map(t => t.plain_text).join('');
      }
    }
    
    return 'Untitled';
  }

  /**
   * Add content blocks to a page
   * @param {string} pageId - Page ID
   * @param {Array} blocks - Content blocks
   * @returns {Promise<void>}
   * @private
   */
  async _addContentBlocks(pageId, blocks) {
    try {
      const children = blocks.map(block => {
        switch (block.type) {
          case 'paragraph':
            return {
              object: 'block',
              type: 'paragraph',
              paragraph: {
                rich_text: [
                  {
                    type: 'text',
                    text: {
                      content: block.content
                    }
                  }
                ]
              }
            };
          case 'heading_1':
            return {
              object: 'block',
              type: 'heading_1',
              heading_1: {
                rich_text: [
                  {
                    type: 'text',
                    text: {
                      content: block.content
                    }
                  }
                ]
              }
            };
          case 'heading_2':
            return {
              object: 'block',
              type: 'heading_2',
              heading_2: {
                rich_text: [
                  {
                    type: 'text',
                    text: {
                      content: block.content
                    }
                  }
                ]
              }
            };
          case 'heading_3':
            return {
              object: 'block',
              type: 'heading_3',
              heading_3: {
                rich_text: [
                  {
                    type: 'text',
                    text: {
                      content: block.content
                    }
                  }
                ]
              }
            };
          case 'bulleted_list_item':
            return {
              object: 'block',
              type: 'bulleted_list_item',
              bulleted_list_item: {
                rich_text: [
                  {
                    type: 'text',
                    text: {
                      content: block.content
                    }
                  }
                ]
              }
            };
          case 'numbered_list_item':
            return {
              object: 'block',
              type: 'numbered_list_item',
              numbered_list_item: {
                rich_text: [
                  {
                    type: 'text',
                    text: {
                      content: block.content
                    }
                  }
                ]
              }
            };
          case 'to_do':
            return {
              object: 'block',
              type: 'to_do',
              to_do: {
                rich_text: [
                  {
                    type: 'text',
                    text: {
                      content: block.content
                    }
                  }
                ],
                checked: block.checked || false
              }
            };
          case 'code':
            return {
              object: 'block',
              type: 'code',
              code: {
                rich_text: [
                  {
                    type: 'text',
                    text: {
                      content: block.content
                    }
                  }
                ],
                language: block.language || 'javascript'
              }
            };
          default:
            return {
              object: 'block',
              type: 'paragraph',
              paragraph: {
                rich_text: [
                  {
                    type: 'text',
                    text: {
                      content: block.content || ''
                    }
                  }
                ]
              }
            };
        }
      });
      
      await this.client.blocks.children.append({
        block_id: pageId,
        children: children
      });
    } catch (error) {
      logger.error(`Error adding content blocks: ${error.message}`);
      throw error;
    }
  }

  /**
   * Delete all blocks from a page
   * @param {string} pageId - Page ID
   * @returns {Promise<void>}
   * @private
   */
  async _deleteAllBlocks(pageId) {
    try {
      const blocks = await this.client.blocks.children.list({
        block_id: pageId
      });
      
      for (const block of blocks.results) {
        await this.client.blocks.delete({
          block_id: block.id
        });
      }
    } catch (error) {
      logger.error(`Error deleting blocks: ${error.message}`);
      throw error;
    }
  }
}

module.exports = NotionService;
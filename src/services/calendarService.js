const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

class CalendarService {
  constructor() {
    this.oAuth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
    
    // Try to load saved credentials
    this._loadCredentials();
    
    // Initialize calendar API
    this.calendar = google.calendar({ version: 'v3', auth: this.oAuth2Client });
    
    logger.info('Google Calendar service initialized');
  }

  /**
   * Get Google OAuth2 authorization URL
   * @returns {string} - Authorization URL
   */
  getAuthUrl() {
    const SCOPES = ['https://www.googleapis.com/auth/calendar'];
    
    // Save the OAuth2 flow state
    this._saveOAuthFlow();
    
    return this.oAuth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent' // Force to get refresh token
    });
  }

  /**
   * Handle Google OAuth2 callback
   * @param {string} code - Authorization code
   * @returns {Promise<void>}
   */
  async handleAuthCallback(code) {
    try {
      const { tokens } = await this.oAuth2Client.getToken(code);
      this.oAuth2Client.setCredentials(tokens);
      
      // Save the tokens
      this._saveCredentials(tokens);
      
      logger.info('Google Calendar authentication successful');
    } catch (error) {
      logger.error(`Error handling auth callback: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get meetings from Google Calendar
   * @param {string} timeMin - Start time (ISO string)
   * @param {string} timeMax - End time (ISO string)
   * @param {number} maxResults - Maximum number of results
   * @returns {Promise<Array>} - Array of meetings
   */
  async getMeetings(timeMin, timeMax, maxResults = 10) {
    try {
      this._checkAuth();
      
      const params = {
        calendarId: 'primary',
        maxResults: maxResults,
        singleEvents: true,
        orderBy: 'startTime'
      };
      
      if (timeMin) {
        params.timeMin = new Date(timeMin).toISOString();
      } else {
        params.timeMin = new Date().toISOString();
      }
      
      if (timeMax) {
        params.timeMax = new Date(timeMax).toISOString();
      }
      
      const response = await this.calendar.events.list(params);
      
      return {
        meetings: response.data.items.map(this._formatEvent),
        nextPageToken: response.data.nextPageToken
      };
    } catch (error) {
      logger.error(`Error getting meetings: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get a specific meeting by ID
   * @param {string} meetingId - Meeting ID
   * @returns {Promise<Object>} - Meeting object
   */
  async getMeeting(meetingId) {
    try {
      this._checkAuth();
      
      const response = await this.calendar.events.get({
        calendarId: 'primary',
        eventId: meetingId
      });
      
      return this._formatEvent(response.data);
    } catch (error) {
      logger.error(`Error getting meeting: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create a new meeting
   * @param {Object} meetingData - Meeting data
   * @returns {Promise<Object>} - Created meeting
   */
  async createMeeting(meetingData) {
    try {
      this._checkAuth();
      
      const { summary, description, start, end, attendees, location, conferenceData } = meetingData;
      
      const event = {
        summary,
        description,
        start: {
          dateTime: new Date(start).toISOString(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
        },
        end: {
          dateTime: new Date(end).toISOString(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
        }
      };
      
      if (attendees && Array.isArray(attendees)) {
        event.attendees = attendees.map(email => ({ email }));
      }
      
      if (location) {
        event.location = location;
      }
      
      // Handle Google Meet integration if requested
      if (conferenceData) {
        event.conferenceData = {
          createRequest: {
            requestId: `${Date.now()}`
          }
        };
      }
      
      const response = await this.calendar.events.insert({
        calendarId: 'primary',
        resource: event,
        conferenceDataVersion: conferenceData ? 1 : 0,
        sendUpdates: 'all'
      });
      
      return this._formatEvent(response.data);
    } catch (error) {
      logger.error(`Error creating meeting: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update an existing meeting
   * @param {string} meetingId - Meeting ID
   * @param {Object} meetingData - Meeting data to update
   * @returns {Promise<Object>} - Updated meeting
   */
  async updateMeeting(meetingId, meetingData) {
    try {
      this._checkAuth();
      
      // Get current event
      const currentEvent = await this.calendar.events.get({
        calendarId: 'primary',
        eventId: meetingId
      });
      
      const { summary, description, start, end, attendees, location } = meetingData;
      
      const event = { ...currentEvent.data };
      
      if (summary) {
        event.summary = summary;
      }
      
      if (description) {
        event.description = description;
      }
      
      if (start) {
        event.start = {
          dateTime: new Date(start).toISOString(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
        };
      }
      
      if (end) {
        event.end = {
          dateTime: new Date(end).toISOString(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
        };
      }
      
      if (attendees && Array.isArray(attendees)) {
        event.attendees = attendees.map(email => ({ email }));
      }
      
      if (location) {
        event.location = location;
      }
      
      const response = await this.calendar.events.update({
        calendarId: 'primary',
        eventId: meetingId,
        resource: event,
        sendUpdates: 'all'
      });
      
      return this._formatEvent(response.data);
    } catch (error) {
      logger.error(`Error updating meeting: ${error.message}`);
      throw error;
    }
  }

  /**
   * Delete a meeting
   * @param {string} meetingId - Meeting ID
   * @returns {Promise<void>}
   */
  async deleteMeeting(meetingId) {
    try {
      this._checkAuth();
      
      await this.calendar.events.delete({
        calendarId: 'primary',
        eventId: meetingId,
        sendUpdates: 'all'
      });
      
      logger.info(`Meeting ${meetingId} deleted successfully`);
    } catch (error) {
      logger.error(`Error deleting meeting: ${error.message}`);
      throw error;
    }
  }

  /**
   * Check if authenticated
   * @private
   */
  _checkAuth() {
    if (!this.oAuth2Client.credentials || !this.oAuth2Client.credentials.access_token) {
      logger.error('Not authenticated with Google Calendar');
      throw new Error('Not authenticated with Google Calendar');
    }
  }

  /**
   * Format Google Calendar event to standardized response
   * @param {Object} event - Google Calendar event
   * @returns {Object} - Formatted meeting
   * @private
   */
  _formatEvent(event) {
    return {
      id: event.id,
      summary: event.summary,
      description: event.description,
      start: event.start,
      end: event.end,
      location: event.location,
      attendees: event.attendees ? event.attendees.map(attendee => ({
        email: attendee.email,
        name: attendee.displayName,
        response_status: attendee.responseStatus
      })) : [],
      organizer: event.organizer ? {
        email: event.organizer.email,
        name: event.organizer.displayName
      } : null,
      conference_data: event.conferenceData ? {
        type: event.conferenceData.conferenceSolution?.name || 'Google Meet',
        link: event.conferenceData.entryPoints?.find(e => e.entryPointType === 'video')?.uri || null
      } : null,
      created: event.created,
      updated: event.updated
    };
  }

  /**
   * Save OAuth2 credentials
   * @param {Object} tokens - OAuth2 tokens
   * @private
   */
  _saveCredentials(tokens) {
    try {
      const credentialsDir = path.join(process.cwd(), '.credentials');
      if (!fs.existsSync(credentialsDir)) {
        fs.mkdirSync(credentialsDir, { recursive: true });
      }
      
      fs.writeFileSync(
        path.join(credentialsDir, 'google-calendar.json'),
        JSON.stringify(tokens)
      );
      
      logger.info('Google Calendar credentials saved');
    } catch (error) {
      logger.error(`Error saving credentials: ${error.message}`);
    }
  }

  /**
   * Load OAuth2 credentials
   * @private
   */
  _loadCredentials() {
    try {
      const credentialsPath = path.join(process.cwd(), '.credentials', 'google-calendar.json');
      
      if (fs.existsSync(credentialsPath)) {
        const tokens = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
        this.oAuth2Client.setCredentials(tokens);
        logger.info('Google Calendar credentials loaded');
      } else {
        logger.info('No saved Google Calendar credentials found');
      }
    } catch (error) {
      logger.error(`Error loading credentials: ${error.message}`);
    }
  }

  /**
   * Save OAuth2 flow state
   * @private
   */
  _saveOAuthFlow() {
    try {
      const flowDir = path.join(process.cwd(), '.credentials');
      if (!fs.existsSync(flowDir)) {
        fs.mkdirSync(flowDir, { recursive: true });
      }
      
      fs.writeFileSync(
        path.join(flowDir, 'google-calendar-flow.json'),
        JSON.stringify({ timestamp: Date.now() })
      );
    } catch (error) {
      logger.error(`Error saving OAuth flow: ${error.message}`);
    }
  }
}

module.exports = CalendarService;
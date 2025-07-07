import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import logger from '../utils/logger.js';
import { NotFoundError, AuthenticationError, ValidationError, CustomError } from '../utils/errors.js';
import { z } from 'zod';

// Define schemas for input validation
const MeetingSchema = z.object({
  summary: z.string().min(1, "Summary cannot be empty"),
  description: z.string().optional(),
  start: z.string().datetime("Start time must be a valid ISO 8601 datetime string"),
  end: z.string().datetime("End time must be a valid ISO 8601 datetime string"),
  attendees: z.array(z.string().email("Invalid email format")).optional(),
  location: z.string().optional(),
  conferenceData: z.boolean().optional() // Indicates if Google Meet should be added
}).refine(data => new Date(data.end) > new Date(data.start), {
  message: "End time must be after start time",
  path: ["end"]
});

const GetMeetingsSchema = z.object({
  timeMin: z.string().datetime("timeMin must be a valid ISO 8601 datetime string").optional(),
  timeMax: z.string().datetime("timeMax must be a valid ISO 8601 datetime string").optional(),
  maxResults: z.number().int().min(1).max(2500).default(10)
}).refine(data => !data.timeMin || !data.timeMax || new Date(data.timeMax) > new Date(data.timeMin), {
  message: "timeMax must be after timeMin",
  path: ["timeMax"]
});

const UpdateMeetingSchema = z.object({
  summary: z.string().min(1, "Summary cannot be empty").optional(),
  description: z.string().optional(),
  start: z.string().datetime("Start time must be a valid ISO 8601 datetime string").optional(),
  end: z.string().datetime("End time must be a valid ISO 8601 datetime string").optional(),
  attendees: z.array(z.string().email("Invalid email format")).optional(),
  location: z.string().optional(),
  conferenceData: z.boolean().optional()
}).refine(data => Object.keys(data).length > 0, { message: "At least one field must be provided for update" })
.refine(data => !data.start || !data.end || new Date(data.end) > new Date(data.start), {
  message: "End time must be after start time",
  path: ["end"]
});

class CalendarService {
  constructor() {
    const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI, NODE_ENV } = process.env;

    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) {
      logger.warn('Google API credentials not provided.');
      
      // In development mode, continue without throwing an error
      if (NODE_ENV === 'development') {
        logger.info('Running in development mode without Google Calendar credentials');
        this.oAuth2Client = null;
        this.calendar = null;
        return;
      } else {
        throw new AuthenticationError('Google API credentials not provided.');
      }
    }

    this.oAuth2Client = new google.auth.OAuth2(
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET,
      GOOGLE_REDIRECT_URI
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
    try {
      const SCOPES = ['https://www.googleapis.com/auth/calendar'];
      
      // Save the OAuth2 flow state
      this._saveOAuthFlow();
      
      return this.oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        prompt: 'consent' // Force to get refresh token
      });
    } catch (error) {
      logger.error(error);
      throw new CustomError(`Error generating auth URL: ${error.message}`);
    }
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
      logger.error(error);
      throw new AuthenticationError(`Error getting access token: ${error.message}`);
    }
  }

  /**
   * Get meetings from Google Calendar
   * @param {string} timeMin - Start time (ISO string)
   * @param {string} timeMax - End time (ISO string)
   * @param {number} maxResults - Maximum number of results
   * @returns {Promise<Array>} - Array of meetings
   */
  async getMeetings(options) {
    try {
      this._checkAuth();
      GetMeetingsSchema.parse(options);

      const params = {
        calendarId: 'primary',
        maxResults: options.maxResults || 10,
        singleEvents: true,
        orderBy: 'startTime'
      };
      
      if (options.timeMin) {
        params.timeMin = new Date(options.timeMin).toISOString();
      } else {
        params.timeMin = new Date().toISOString();
      }
      
      if (options.timeMax) {
        params.timeMax = new Date(options.timeMax).toISOString();
      }
      
      const response = await this.calendar.events.list(params);
      
      return {
        meetings: response.data.items.map(this._formatEvent),
        nextPageToken: response.data.nextPageToken
      };
    } catch (error) {
      if (error instanceof ZodError) {
        logger.error(`Validation error getting meetings: ${error.errors.map(e => e.message).join(', ')}`);
        throw new ValidationError(`Validation error getting meetings: ${error.errors.map(e => e.message).join(', ')}`);
      } else if (error.code === 401) {
        throw new AuthenticationError('Unauthorized: Invalid or expired Google Calendar credentials.');
      } else if (error.code === 404) {
        throw new NotFoundError('Calendar not found or no events found.');
      } else {
        logger.error(error);
        throw new CustomError(`Error getting meetings: ${error.message}`);
      }
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
      if (error.code === 401) {
        throw new AuthenticationError('Unauthorized: Invalid or expired Google Calendar credentials.');
      } else if (error.code === 404) {
        throw new NotFoundError(`Meeting with ID ${meetingId} not found.`);
      } else {
        logger.error(error);
        throw new CustomError(`Error getting meeting: ${error.message}`);
      }
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
      MeetingSchema.parse(meetingData);
      
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
        conferenceDataVersion: conferenceData ? 1 : 0 // Request conference data if needed
      });
      
      return this._formatEvent(response.data);
    } catch (error) {
      if (error instanceof ZodError) {
        logger.error(`Validation error creating meeting: ${error.errors.map(e => e.message).join(', ')}`);
        throw new ValidationError(`Validation error creating meeting: ${error.errors.map(e => e.message).join(', ')}`);
      } else if (error.code === 401) {
        throw new AuthenticationError('Unauthorized: Invalid or expired Google Calendar credentials.');
      } else if (error.code === 400) {
        throw new CustomError(`Bad Request: ${error.message}`);
      } else {
        logger.error(error);
        throw new CustomError(`Error creating meeting: ${error.message}`);
      }
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
      UpdateMeetingSchema.parse(meetingData);
      
      const { summary, description, start, end, attendees, location, conferenceData } = meetingData;
      
      const event = {};
      if (summary) event.summary = summary;
      if (description) event.description = description;
      if (start) event.start = { dateTime: new Date(start).toISOString(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone };
      if (end) event.end = { dateTime: new Date(end).toISOString(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone };
      if (attendees) event.attendees = attendees.map(email => ({ email }));
      if (location) event.location = location;
      if (conferenceData) {
        event.conferenceData = {
          createRequest: {
            requestId: `${Date.now()}`
          }
        };
      }

      if (Object.keys(event).length === 0) {
        throw new ValidationError('No fields provided for update.');
      }
      
      const response = await this.calendar.events.patch({
        calendarId: 'primary',
        eventId: meetingId,
        resource: event,
        conferenceDataVersion: conferenceData ? 1 : 0 // Request conference data if needed
      });
      
      return this._formatEvent(response.data);
    } catch (error) {
      if (error instanceof ZodError) {
        logger.error(`Validation error updating meeting: ${error.errors.map(e => e.message).join(', ')}`);
        throw new ValidationError(`Validation error updating meeting: ${error.errors.map(e => e.message).join(', ')}`);
      } else if (error.code === 401) {
        throw new AuthenticationError('Unauthorized: Invalid or expired Google Calendar credentials.');
      } else if (error.code === 404) {
        throw new NotFoundError(`Meeting with ID ${meetingId} not found.`);
      } else if (error.code === 400) {
        throw new CustomError(`Bad Request: ${error.message}`);
      } else {
        logger.error(error);
        throw new CustomError(`Error updating meeting: ${error.message}`);
      }
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
      if (error.code === 401) {
        throw new AuthenticationError('Unauthorized: Invalid or expired Google Calendar credentials.');
      } else if (error.code === 404) {
        throw new NotFoundError(`Meeting with ID ${meetingId} not found.`);
      } else {
        logger.error(error);
        throw new CustomError(`Error deleting meeting: ${error.message}`);
      }
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
      logger.error(error);
      throw new CustomError(`Error saving credentials: ${error.message}`);
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
      logger.error(error);
      throw new CustomError(`Error loading credentials: ${error.message}`);
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

export default CalendarService;
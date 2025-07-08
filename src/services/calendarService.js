import { google } from 'googleapis';
import logger from '../utils/logger.js';
import { AuthenticationError } from '../utils/errors.js';

class CalendarService {
  constructor() {
    const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } = process.env;
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) {
      logger.warn('Google API credentials not provided.');
      this.oAuth2Client = null;
      this.calendar = null;
      return;
    }
    this.oAuth2Client = new google.auth.OAuth2(
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET,
      GOOGLE_REDIRECT_URI
    );
    this.calendar = google.calendar({ version: 'v3', auth: this.oAuth2Client });
    logger.info('Google Calendar service initialized');
  }

  async getEvent(eventId) {
    if (!this.calendar) return {};
    try {
      const res = await this.calendar.events.get({
        calendarId: 'primary',
        eventId
      });
      return res.data;
    } catch (error) {
      logger.error(error);
      return {};
    }
  }

  async getEvents() {
    if (!this.calendar) return [];
    try {
      const res = await this.calendar.events.list({
        calendarId: 'primary',
        maxResults: 10,
        singleEvents: true,
        orderBy: 'startTime'
      });
      return res.data.items || [];
    } catch (error) {
      logger.error(error);
      return [];
    }
  }

  async createMeeting(summary, description, startDateTime, endDateTime, attendees) {
    if (!this.calendar) return {};
    try {
      const event = {
        summary,
        description,
        start: { dateTime: startDateTime },
        end: { dateTime: endDateTime },
        attendees: attendees ? attendees.map(email => ({ email })) : undefined
      };
      const res = await this.calendar.events.insert({
        calendarId: 'primary',
        resource: event
      });
      return res.data;
    } catch (error) {
      logger.error(error);
      return {};
    }
  }
}

export default CalendarService; 
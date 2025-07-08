class CalendarService {
  constructor() {
    console.log('CalendarService initialized');
  }

  async getEvent(eventId) {
    // Return a dummy event
    return { id: eventId, summary: "Dummy Event", start: new Date().toISOString(), end: new Date().toISOString() };
  }

  async getEvents() {
    // Return a list of dummy events
    return [
      { id: "1", summary: "Event 1", start: new Date().toISOString(), end: new Date().toISOString() },
      { id: "2", summary: "Event 2", start: new Date().toISOString(), end: new Date().toISOString() }
    ];
  }

  async createMeeting(summary, description, startDateTime, endDateTime, attendees) {
    // Return a dummy created meeting
    return { id: "new-meeting", summary, description, startDateTime, endDateTime, attendees };
  }
}

export default CalendarService; 
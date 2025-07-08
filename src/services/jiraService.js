class JiraService {
  constructor() {
    console.log('JiraService initialized');
  }

  async getTask(taskId) {
    // Return a dummy task
    return { id: taskId, summary: "Dummy Jira Task", status: "To Do" };
  }

  async getTasks() {
    // Return a list of dummy tasks
    return [
      { id: "1", summary: "Task 1", status: "To Do" },
      { id: "2", summary: "Task 2", status: "In Progress" }
    ];
  }

  async createTask(params) {
    // Return a dummy created task
    return { id: "new-task", key: "TASK-123", self: "https://jira.example.com/browse/TASK-123" };
  }

  async updateTask(taskKey, { summary, description, status }) {
    // Simulate update
    return { id: taskKey, summary, description, status };
  }
}

export default JiraService; 
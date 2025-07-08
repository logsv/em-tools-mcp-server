class NotionService {
  constructor() {
    console.log('NotionService initialized');
  }

  async getDoc(docId) {
    // Return a dummy document
    return { id: docId, title: "Dummy Notion Doc", content: "This is a test document." };
  }

  async searchDocs() {
    // Return a list of dummy documents
    return [
      { id: "1", title: "Doc 1", content: "Content 1" },
      { id: "2", title: "Doc 2", content: "Content 2" }
    ];
  }

  async createDoc(title, parentId, content) {
    // Return a dummy created document
    return { id: "new-doc", title, parentId, content };
  }
}

export default NotionService; 
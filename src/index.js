const MCPServer = require('./mcpServer');
const logger = require('./utils/logger');

async function main() {
    const mcpServer = new MCPServer();
    await mcpServer.start();
}

main().catch(error => {
    logger.error(`Failed to start MCP Server: ${error.message}`);
    process.exit(1);
});
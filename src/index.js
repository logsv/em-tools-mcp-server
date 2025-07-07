import MCPServer from './mcpServer.js';
import logger from './utils/logger.js';

async function main() {
    const mcpServer = new MCPServer();
    await mcpServer.start();
}

main().catch(error => {
    logger.error(`Failed to start MCP Server: ${error.message}`);
    process.exit(1);
});
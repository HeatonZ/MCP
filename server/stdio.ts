import { StdioServerTransport } from "npm:@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer } from "./mcp.ts";

const server = await createMcpServer();
const transport = new StdioServerTransport();
await server.connect(transport);

console.log("MCP stdio server connected."); 
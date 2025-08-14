import type { McpServer } from "npm:@modelcontextprotocol/sdk/server/mcp.js";
import { logError, logInfo } from "@server/logger.ts";
import { handleRpcPayload } from "@server/transport/rpc.ts";

export async function handleHttpRpc(_server: McpServer, req: Request): Promise<Response> {
  try {
    const contentType = req.headers.get("Content-Type") || "";
    if (!contentType.includes("application/json")) {
      return new Response("Unsupported Content-Type", { status: 415 });
    }
    const body = await req.text();
    const out = await handleRpcPayload(body);
    logInfo("mcp-http", "rpc", {});
    return new Response(out, { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    logError("mcp-http", "rpc failed", { error: String(e) });
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}



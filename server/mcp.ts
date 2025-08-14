import { McpServer, ResourceTemplate } from "npm:@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "npm:zod";
import { getConfigSync, loadConfig } from "@server/config.ts";
import { getAllTools, initPlugins } from "@server/tools.ts";

export async function createMcpServer(): Promise<McpServer> {
  const server = new McpServer({
    name: getConfigSync()?.serverName ?? "deno-mcp",
    version: getConfigSync()?.version ?? "0.0.0"
  });

  await initPlugins();

  server.registerResource(
    "config",
    "config://app",
    {
      title: "应用配置",
      description: "当前应用配置",
      mimeType: "application/json"
    },
    async (uri) => ({
      contents: [{ uri: uri.href, text: JSON.stringify(getConfigSync() ?? await loadConfig(), null, 2) }]
    })
  );

  server.registerResource(
    "greeting",
    new ResourceTemplate("greeting://{name}", { list: undefined }),
    { title: "问候", description: "动态问候资源" },
    (uri, { name }) => ({
      contents: [{ uri: uri.href, text: `Hello, ${name}!` }]
    })
  );

  server.registerResource(
    "file",
    new ResourceTemplate("filex://{path}", { list: undefined }),
    { title: "文件读取", description: "读取文件内容", mimeType: "text/plain" },
    async (uri, { path }) => ({
      contents: [{ uri: uri.href, text: await Deno.readTextFile(String(path)) }]
    })
  );

  for (const t of await getAllTools()) {
    server.registerTool(
      t.name,
      t.zodSchema
        ? { title: t.title, description: t.description, inputSchema: t.zodSchema }
        : { title: t.title, description: t.description },
      ((args: Record<string, unknown>) => t.handler(args).then((r) => ({ content: [{ type: "text", text: r.text }], isError: r.isError }))) as unknown as { (args: Record<string, unknown>): Promise<{ [x: string]: unknown; content: { [x: string]: unknown; type: "text"; text: string; }[]; isError?: boolean }>; }
    );
  }

  server.registerPrompt(
    "review-code",
    { title: "代码审查", description: "简单代码审查", argsSchema: { code: z.string() } },
    ({ code }) => ({
      messages: [{ role: "user", content: { type: "text", text: `请审查以下代码:\n\n${code}` } }]
    })
  );

  return server;
} 
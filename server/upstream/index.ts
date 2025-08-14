import { getConfigSync, loadConfig } from "@server/config.ts";
import type { AppConfig } from "@shared/types/system.ts";
import { logError, logInfo, logWarn } from "@server/logger.ts";
import type { ToolSpec } from "@shared/types/tool.ts";

// MCP TS SDK client imports
import { Client } from "npm:@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "npm:@modelcontextprotocol/sdk/client/stdio.js";

type UpstreamInstance = {
  name: string;
  namespace: string;
  client: Client;
  transport: StdioClientTransport;
  tools: ToolSpec[];
};

const upstreams: Map<string, UpstreamInstance> = new Map();

async function ensureConfig(): Promise<AppConfig> {
  return getConfigSync() ?? await loadConfig();
}

export async function initUpstreams(): Promise<void> {
  const cfg = await ensureConfig();
  const list = cfg.upstreams?.filter(u => u.enabled !== false) ?? [];
  if (!list.length) return;
  for (const u of list) {
    if (u.transport !== "stdio") {
      logWarn("upstream", "unsupported transport", { name: u.name, transport: u.transport } as Record<string, unknown>);
      continue;
    }
    try {
      const transport = new StdioClientTransport({
        command: u.command,
        args: u.args ?? [],
        cwd: u.cwd,
        env: u.env,
      });
      const client = new Client({ name: `proxy-${u.name}`, version: cfg.version });
      await client.connect(transport);
      const ns = u.namespace || u.name;
      const tools = await fetchToolsAsSpecs(client, ns);
      upstreams.set(u.name, { name: u.name, namespace: ns, client, transport, tools });
      logInfo("upstream", "connected", { name: u.name, namespace: ns, tools: tools.map(t => t.name) } as Record<string, unknown>);
    } catch (e) {
      logError("upstream", "connect failed", { name: u.name, error: String(e) } as Record<string, unknown>);
    }
  }
}

async function fetchToolsAsSpecs(client: Client, namespace: string): Promise<ToolSpec[]> {
  const list = await client.listTools();
  const specs: ToolSpec[] = [];
  for (const t of (list?.tools ?? [])) {
    const name = `${namespace}/${t.name}`;
    const title = t.title ?? t.name;
    const description = t.description ?? "";
    const zodSchema = undefined;
    const inputSchema: Record<string, "string"|"number"|"json"> | undefined = undefined;
    const handler = async (args: Record<string, unknown>) => {
      try {
        const res = await client.callTool({ name: t.name, arguments: args });
        const textParts: string[] = [];
        const contentUnknown = (res as { content?: unknown }).content;
        const items = Array.isArray(contentUnknown) ? contentUnknown as Array<unknown> : [];
        for (const c of items) {
          const item = c as { type?: string; text?: string };
          if (item.type === "text" && typeof item.text === "string") {
            textParts.push(item.text);
          } else {
            textParts.push(JSON.stringify(c));
          }
        }
        return { text: textParts.join("\n") };
      } catch (e) {
        return { text: String(e), isError: true };
      }
    };
    specs.push({ name, title, description, inputSchema, zodSchema, handler });
  }
  return specs;
}

export async function listUpstreamToolsAsPlugin() {
  // 延迟初始化；若未连接则返回空
  const cfg = await ensureConfig();
  const list = cfg.upstreams?.filter(u => u.enabled !== false) ?? [];
  if (!list.length) return null;
  return {
    name: "upstream-tools",
    version: cfg.version,
    getTools: () => {
      const all: ToolSpec[] = [];
      for (const u of list) {
        const inst = upstreams.get(u.name);
        if (!inst) continue;
        all.push(...inst.tools);
      }
      return all;
    }
  };
}



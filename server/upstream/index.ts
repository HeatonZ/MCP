import { getConfigSync, loadConfig } from "@server/config.ts";
import type { AppConfig, UpstreamConfig as _UpstreamConfig, UpstreamConfigStdio, UpstreamConfigHttp, UpstreamConfigSse, UpstreamConfigWs } from "@shared/types/system.ts";
import { logError, logInfo, logWarn } from "@server/logger.ts";
import type { ToolSpec } from "@shared/types/tool.ts";

// MCP TS SDK client imports
import { Client } from "npm:@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "npm:@modelcontextprotocol/sdk/client/stdio.js";
import { initUpstreamMetrics, markConnected, markDisconnected, setCounts } from "@server/upstream/metrics.ts";

type UpstreamInstance = {
  name: string;
  namespace: string;
  client: McpClientLike;
  transport?: StdioClientTransport;
  tools: ToolSpec[];
};

const upstreams: Map<string, UpstreamInstance> = new Map();

type JsonValue = null | string | number | boolean | JsonValue[] | { [k: string]: JsonValue };

type ToolItem = { name: string; title?: string; description?: string; inputSchema?: Record<string, "string"|"number"|"json"> };
type ToolsListResult = { tools: ToolItem[] };
type ToolCallResult = { content?: Array<{ type?: string; text?: string }> } & Record<string, unknown>;
type ResourceItem = { uri: string; title?: string; mimeType?: string };
type ResourcesListResult = { resources: ResourceItem[] };
type ReadResourceResult = { contents: Array<{ uri: string; text?: string; mimeType?: string }> };
type PromptItem = { name: string; description?: string };
type PromptsListResult = { prompts: PromptItem[] };
type GetPromptResult = { messages: unknown[] };

type McpClientLike = {
  listTools: () => Promise<ToolsListResult>;
  callTool: (req: { name: string; arguments: Record<string, unknown> }) => Promise<ToolCallResult>;
  listResources?: () => Promise<ResourcesListResult>;
  readResource?: (req: { uri: string }) => Promise<ReadResourceResult>;
  listPrompts?: () => Promise<PromptsListResult>;
  getPrompt?: (req: { name: string; arguments?: Record<string, unknown> }) => Promise<GetPromptResult>;
};

function isRecord(v: unknown): v is Record<string, unknown> { return typeof v === "object" && v !== null && !Array.isArray(v); }
function asString(v: unknown): string | undefined { return typeof v === "string" ? v : undefined; }
function asToolsListResult(v: unknown): ToolsListResult {
  const tools: ToolItem[] = [];
  if (isRecord(v) && Array.isArray(v.tools)) {
    for (const it of v.tools) {
      if (isRecord(it) && typeof it.name === "string") {
        const title = asString(it.title);
        const description = asString(it.description);
        tools.push({ name: it.name, title, description });
      }
    }
  }
  return { tools };
}
function asToolCallResult(v: unknown): ToolCallResult {
  const out: ToolCallResult = {};
  if (isRecord(v) && Array.isArray(v.content)) {
    out.content = v.content as Array<{ type?: string; text?: string }>;
  }
  return out;
}
function asResourcesListResult(v: unknown): ResourcesListResult {
  const resources: ResourceItem[] = [];
  if (isRecord(v) && Array.isArray(v.resources)) {
    for (const it of v.resources) {
      if (isRecord(it) && typeof it.uri === "string") {
        resources.push({ uri: it.uri, title: asString(it.title), mimeType: asString((it as Record<string, unknown>).mimeType) });
      }
    }
  }
  return { resources };
}
function asReadResourceResult(v: unknown): ReadResourceResult {
  const contents: Array<{ uri: string; text?: string; mimeType?: string }> = [];
  if (isRecord(v) && Array.isArray(v.contents)) {
    for (const it of v.contents) {
      if (isRecord(it) && typeof it.uri === "string") {
        contents.push({ uri: it.uri, text: asString(it.text), mimeType: asString((it as Record<string, unknown>).mimeType) });
      }
    }
  }
  return { contents };
}
function asPromptsListResult(v: unknown): PromptsListResult {
  const prompts: PromptItem[] = [];
  if (isRecord(v) && Array.isArray(v.prompts)) {
    for (const it of v.prompts) {
      if (isRecord(it) && typeof it.name === "string") {
        prompts.push({ name: it.name, description: asString(it.description) });
      }
    }
  }
  return { prompts };
}
function asGetPromptResult(v: unknown): GetPromptResult {
  if (isRecord(v) && Array.isArray(v.messages)) return { messages: v.messages } as GetPromptResult;
  return { messages: [] };
}

function sdkClientAdapter(c: Client): McpClientLike {
  return {
    listTools: async () => asToolsListResult(await (c.listTools() as unknown as Promise<unknown>)),
    callTool: async (r) => asToolCallResult(await (c.callTool(r) as unknown as Promise<unknown>)),
    listResources: async () => asResourcesListResult(await ((c as unknown as { listResources: () => Promise<unknown> }).listResources?.() ?? Promise.resolve({ resources: [] }))),
    readResource: async (r) => asReadResourceResult(await ((c as unknown as { readResource: (r: unknown) => Promise<unknown> }).readResource?.(r) ?? Promise.resolve({ contents: [] }))),
    listPrompts: async () => asPromptsListResult(await ((c as unknown as { listPrompts: () => Promise<unknown> }).listPrompts?.() ?? Promise.resolve({ prompts: [] }))),
    getPrompt: async (r) => asGetPromptResult(await ((c as unknown as { getPrompt: (r: unknown) => Promise<unknown> }).getPrompt?.(r) ?? Promise.resolve({ messages: [] }))),
  };
}

function httpClientAdapter(url: string, headers?: Record<string, string>): McpClientLike {
  async function rpc(method: string, params?: Record<string, unknown>): Promise<{ result?: JsonValue; error?: { code: number; message: string; data?: JsonValue } }>{
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method, params });
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...(headers ?? {}) }, body });
    const json = await res.json();
    return json as { result?: JsonValue; error?: { code: number; message: string; data?: JsonValue } };
  }
  return {
    listTools: async () => {
      const r = await rpc("tools/list");
      if (r.error) throw new Error(r.error.message);
      return asToolsListResult(r.result);
    },
    callTool: async (req) => {
      const r = await rpc("tools/call", { name: req.name, args: req.arguments });
      if (r.error) throw new Error(r.error.message);
      return asToolCallResult(r.result);
    },
    listResources: async () => {
      const r = await rpc("resources/list");
      if (r.error) return { resources: [] } as ResourcesListResult;
      return asResourcesListResult(r.result);
    },
    readResource: async (p) => {
      const r = await rpc("resources/read", p as Record<string, unknown>);
      if (r.error) throw new Error(r.error.message);
      return asReadResourceResult(r.result);
    },
    listPrompts: async () => {
      const r = await rpc("prompts/list");
      if (r.error) return { prompts: [] } as PromptsListResult;
      return asPromptsListResult(r.result);
    },
    getPrompt: async (p) => {
      const r = await rpc("prompts/get", p as Record<string, unknown>);
      if (r.error) throw new Error(r.error.message);
      return asGetPromptResult(r.result);
    },
  };
}

async function ensureConfig(): Promise<AppConfig> {
  return getConfigSync() ?? await loadConfig();
}

function isStdio(u: AppConfig["upstreams"] extends infer T ? (T extends Array<infer U> ? U : never) : never): u is UpstreamConfigStdio {
  return (u as { transport: string }).transport === "stdio";
}
function isHttp(u: AppConfig["upstreams"] extends infer T ? (T extends Array<infer U> ? U : never) : never): u is UpstreamConfigHttp {
  return (u as { transport: string }).transport === "http";
}
function isSse(u: AppConfig["upstreams"] extends infer T ? (T extends Array<infer U> ? U : never) : never): u is UpstreamConfigSse {
  return (u as { transport: string }).transport === "sse";
}
function isWs(u: AppConfig["upstreams"] extends infer T ? (T extends Array<infer U> ? U : never) : never): u is UpstreamConfigWs {
  return (u as { transport: string }).transport === "ws";
}

export async function initUpstreams(): Promise<void> {
  const cfg = await ensureConfig();
  const list = cfg.upstreams?.filter(u => u.enabled !== false) ?? [];
  if (!list.length) return;
  for (const u of list) {
    initUpstreamMetrics(u.name, u.transport);
    try {
      const ns = u.namespace || u.name;
      let clientLike: McpClientLike;
      let transport: StdioClientTransport | undefined = undefined;
      if (isStdio(u)) {
        const t = new StdioClientTransport({ command: u.command, args: u.args ?? [], cwd: u.cwd, env: u.env });
        const client = new Client({ name: `proxy-${u.name}`, version: cfg.version });
        await client.connect(t);
        clientLike = sdkClientAdapter(client);
        transport = t;
      } else if (isHttp(u) || isSse(u) || isWs(u)) {
        const httpUrl = u.url;
        const headers = u.headers;
        clientLike = httpClientAdapter(httpUrl, headers);
      } else {
        logWarn("upstream", "unsupported transport", { name: (u as { name?: string }).name ?? "", transport: (u as { transport?: string }).transport ?? "" } as Record<string, unknown>);
        continue;
      }
      const tools: ToolSpec[] = await fetchToolsAsSpecs(clientLike, ns);
      upstreams.set(u.name, { name: u.name, namespace: ns, client: clientLike, transport, tools });
      const toolNames: string[] = [];
      for (const t of tools) toolNames.push(t.name);
      logInfo("upstream", "connected", { name: u.name, namespace: ns, tools: toolNames } as Record<string, unknown>);
      markConnected(u.name);
      setCounts(u.name, { toolCount: tools.length });
    } catch (e) {
      logError("upstream", "connect failed", { name: u.name, error: String(e) } as Record<string, unknown>);
      markDisconnected(u.name, String(e));
    }
  }
}

async function fetchToolsAsSpecs(client: McpClientLike, namespace: string): Promise<ToolSpec[]> {
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

export async function listAggregatedResources(): Promise<Array<{ upstream: string; namespace: string; uri: string; title?: string; mimeType?: string }>> {
  const out: Array<{ upstream: string; namespace: string; uri: string; title?: string; mimeType?: string }> = [];
  for (const [name, inst] of upstreams.entries()) {
    try {
      const r = await inst.client.listResources?.();
      const items = (r && (r as ResourcesListResult).resources ? (r as ResourcesListResult).resources : []);
      for (const it of items) out.push({ upstream: name, namespace: inst.namespace, uri: it.uri, title: it.title, mimeType: it.mimeType });
    } catch (_) { /* ignore one upstream failure */ }
  }
  return out;
}

export async function readAggregatedResource(upstream: string, uri: string): Promise<{ contents: Array<{ uri: string; text?: string; mimeType?: string }> }>{
  const inst = upstreams.get(upstream);
  if (!inst) throw new Error("upstream not found");
  const r = await inst.client.readResource?.({ uri });
  if (!r) return { contents: [] };
  return r as ReadResourceResult;
}

export async function listAggregatedPrompts(): Promise<Array<{ upstream: string; namespace: string; name: string; description?: string }>> {
  const out: Array<{ upstream: string; namespace: string; name: string; description?: string }> = [];
  for (const [name, inst] of upstreams.entries()) {
    try {
      const r = await inst.client.listPrompts?.();
      const items = (r && (r as PromptsListResult).prompts ? (r as PromptsListResult).prompts : []);
      for (const it of items) out.push({ upstream: name, namespace: inst.namespace, name: it.name, description: it.description });
    } catch (_) { /* ignore */ }
  }
  return out;
}

export async function getAggregatedPrompt(upstream: string, name: string, args?: Record<string, unknown>): Promise<{ messages: unknown[] }>{
  const inst = upstreams.get(upstream);
  if (!inst) throw new Error("upstream not found");
  const r = await inst.client.getPrompt?.({ name, arguments: args ?? {} });
  if (!r) return { messages: [] };
  return r as GetPromptResult;
}



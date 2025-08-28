import { getConfigSync, loadConfig } from "@server/config.ts";
import type { AppConfig, UpstreamConfig as _UpstreamConfig, UpstreamConfigStdio, UpstreamConfigHttp, UpstreamConfigSse, UpstreamConfigWs } from "@shared/types/system.ts";
import { logError, logInfo, logWarn } from "@server/logger.ts";
import type { ToolSpec } from "@shared/types/tool.ts";

// MCP TS SDK client imports
import { Client } from "npm:@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "npm:@modelcontextprotocol/sdk/client/stdio.js";
import { initUpstreamMetrics, markConnected, markDisconnected, setCounts, setNamespace } from "@server/upstream/metrics.ts";

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

function extractSimpleSchema(jsonSchema: unknown): Record<string, "string"|"number"|"json"> | undefined {
  if (!isRecord(jsonSchema)) return undefined;
  
  const properties = jsonSchema.properties;
  if (!isRecord(properties)) return undefined;
  
  const result: Record<string, "string"|"number"|"json"> = {};
  
  for (const [key, prop] of Object.entries(properties)) {
    if (!isRecord(prop)) continue;
    
    const type = prop.type;
    if (type === "string") {
      result[key] = "string";
    } else if (type === "number" || type === "integer") {
      result[key] = "number";
    } else if (type === "boolean") {
      // boolean类型在前端界面中用字符串表示 (true/false)
      result[key] = "string";
    } else if (type === "object" || type === "array") {
      result[key] = "json";
    } else {
      // 默认作为字符串处理
      result[key] = "string";
    }
  }
  
  return Object.keys(result).length > 0 ? result : undefined;
}

// 为已知的上游工具手动定义缺失的schema
// 这些定义基于在线context7服务的实际schema
function getManualSchema(toolName: string): Record<string, "string"|"number"|"json"> | undefined {
  const manualSchemas: Record<string, Record<string, "string"|"number"|"json">> = {
    "resolve-library-id": {
      "libraryName": "string"  // 必需参数
    },
    "get-library-docs": {
      "context7CompatibleLibraryID": "string",  // 必需参数
      "topic": "string",                        // 可选参数
      "tokens": "number"                        // 可选参数
    },
    // sequential-thinking工具的fallback schema（当MCP传输中schema丢失时使用）
    "sequentialthinking": {
      "thought": "string",                      // 当前思考步骤（必需）
      "nextThoughtNeeded": "string",            // 是否需要更多思考 true/false（必需）
      "thoughtNumber": "number",                // 当前思考编号（必需）
      "totalThoughts": "number",                // 预估总思考数（必需）
      "isRevision": "string",                   // 是否为修正思考 true/false（可选）
      "revisesThought": "number",               // 修正的思考编号（可选）
      "branchFromThought": "number",            // 分支起始思考编号（可选）
      "branchId": "string",                     // 分支标识符（可选）
      "needsMoreThoughts": "string"             // 是否需要更多思考 true/false（可选）
    }
  };
  
  return manualSchemas[toolName];
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
  async function readNdjsonFirstLine(res: Response): Promise<unknown> {
    const body = res.body;
    if (!body) return null;
    const reader = body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value ?? "";
      for (;;) {
        const lf = buffer.indexOf("\n");
        if (lf < 0) break;
        const line = buffer.slice(0, lf).replace(/\r$/, "").trim();
        buffer = buffer.slice(lf + 1);
        if (line) {
          try { return JSON.parse(line); } catch { return line; }
        }
      }
    }
    const last = buffer.trim();
    if (last) { try { return JSON.parse(last); } catch { return last; } }
    return null;
  }

  async function readSseFirstMessage(res: Response): Promise<unknown> {
    const body = res.body;
    if (!body) return null;
    const reader = body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value ?? "";
      
      // Parse SSE format: event: message\ndata: {...}\n\n
      // 寻找完整的SSE消息块
      const messageStart = buffer.indexOf('event: message');
      if (messageStart >= 0) {
        const dataStart = buffer.indexOf('data: ', messageStart);
        if (dataStart >= 0) {
          const dataContent = buffer.substring(dataStart + 6);
          const messageEnd = dataContent.indexOf('\n\n');
          if (messageEnd >= 0) {
            const jsonData = dataContent.substring(0, messageEnd).trim();
            try {
              return JSON.parse(jsonData);
            } catch {
              return jsonData;
            }
          }
        }
      }
    }
    return null;
  }

  async function rpc(method: string, params?: Record<string, unknown>): Promise<{ result?: JsonValue; error?: { code: number; message: string; data?: JsonValue } }>{
    const defaultHeaders: Record<string, string> = {
      Accept: "application/x-ndjson, application/json",
    };
    const merged: Record<string, string> = { ...defaultHeaders, ...(headers ?? {}) };
    const contentType = Object.keys(merged).find(k => k.toLowerCase() === "content-type") ? (merged[Object.keys(merged).find(k => k.toLowerCase() === "content-type") as string] || "") : "";
    if (!contentType) merged["Content-Type"] = "application/json";

    const payload = { jsonrpc: "2.0", id: 1, method, params } as Record<string, unknown>;
    const useNdjsonRequest = (merged["Content-Type"] || merged[Object.keys(merged).find(k => k.toLowerCase() === "content-type") as string] || "").toLowerCase().includes("application/x-ndjson");
    const body = useNdjsonRequest ? JSON.stringify(payload) + "\n" : JSON.stringify(payload);

    const res = await fetch(url, { method: "POST", headers: merged, body });
    const respCt = (res.headers.get("Content-Type") || "").toLowerCase();
    if (respCt.includes("application/x-ndjson")) {
      const first = await readNdjsonFirstLine(res);
      return (first ?? {}) as { result?: JsonValue; error?: { code: number; message: string; data?: JsonValue } };
    }
    if (respCt.includes("text/event-stream")) {
      const first = await readSseFirstMessage(res);
      return (first ?? {}) as { result?: JsonValue; error?: { code: number; message: string; data?: JsonValue } };
    }
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
      const r = await rpc("tools/call", { name: req.name, arguments: req.arguments });
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
      setNamespace(u.name, ns);
      setCounts(u.name, { toolCount: tools.length });
    } catch (e) {
      logError("upstream", "connect failed", { name: u.name, error: String(e) } as Record<string, unknown>);
      markDisconnected(u.name, String(e));
    }
  }
}

export async function reconnectUpstream(name: string): Promise<boolean> {
  const cfg = await ensureConfig();
  const u = (cfg.upstreams ?? []).find(x => x.name === name && x.enabled !== false);
  if (!u) return false;
  try {
    // dispose old
    const old = upstreams.get(name);
    if (old?.transport && typeof (old.transport as unknown as { close?: () => Promise<void> }).close === "function") {
      try { await (old.transport as unknown as { close: () => Promise<void> }).close(); } catch { /* ignore */ }
    }
    upstreams.delete(name);
    // re-init single upstream
    initUpstreamMetrics(u.name, u.transport);
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
      return false;
    }
    const tools: ToolSpec[] = await fetchToolsAsSpecs(clientLike, ns);
    upstreams.set(u.name, { name: u.name, namespace: ns, client: clientLike, transport, tools });
    markConnected(u.name);
    setNamespace(u.name, ns);
    setCounts(u.name, { toolCount: tools.length });
    return true;
  } catch {
    return false;
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
    // 从上游工具的inputSchema中提取简化的schema信息，如果为空则尝试使用手动定义的schema
    let inputSchema: Record<string, "string"|"number"|"json"> | undefined = extractSimpleSchema(t.inputSchema);
    if (!inputSchema) {
      inputSchema = getManualSchema(t.name);
    }
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



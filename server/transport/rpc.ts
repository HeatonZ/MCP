import { getAllTools } from "@server/tools.ts";
import { logError } from "@server/logger.ts";
import { getUpstreamStatus } from "@server/upstream/metrics.ts";
import { listAggregatedResources, listAggregatedPrompts, getAggregatedPrompt } from "@server/upstream/index.ts";
import { getConfigSync } from "@server/config.ts";

type JsonValue = null | string | number | boolean | JsonValue[] | { [k: string]: JsonValue };
type JsonRpcId = string | number | null;

type JsonRpcRequest = {
  jsonrpc: "2.0";
  id?: JsonRpcId;
  method: string;
  params?: Record<string, unknown>;
};

type JsonRpcResponse = {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result?: JsonValue;
  error?: { code: number; message: string; data?: JsonValue };
};

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function err(id: JsonRpcId, code: number, message: string, data?: JsonValue): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message, ...(data === undefined ? {} : { data }) } };
}

async function handleOne(req: JsonRpcRequest): Promise<JsonRpcResponse> {
  const id = ("id" in req ? (req.id as JsonRpcId) : null) as JsonRpcId;
  if (req.jsonrpc !== "2.0" || typeof req.method !== "string") {
    return err(id, -32600, "Invalid Request");
  }

  try {
    // MCP 标准握手方法
    if (req.method === "initialize") {
      const p = (req.params ?? {}) as Record<string, unknown>;
      const protocolVersion = String(p.protocolVersion ?? "2024-11-05");
      const _clientInfo = (p.clientInfo ?? {}) as Record<string, unknown>;
      
      const cfg = getConfigSync();
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion,
          capabilities: {
            tools: {},
            resources: {},
            prompts: {},
            logging: {}
          },
          serverInfo: {
            name: cfg?.serverName ?? "deno-mcp-server",
            version: cfg?.version ?? "0.1.0"
          }
        }
      };
    }

    // MCP 标准通知处理
    if (req.method === "notifications/initialized") {
      // initialized 是通知，根据JSON-RPC 2.0标准，通知不应该有响应
      // 这里我们需要特殊处理，因为框架期望返回值，但实际上不会发送响应
      return { jsonrpc: "2.0", id: null, result: null };
    }

    if (req.method === "tools/list") {
      const items = (await getAllTools()).map((t) => {
        // 将简化的 inputSchema 转换为标准 JSON Schema 格式
        const inputSchema = t.inputSchema ?? {};
        const properties: Record<string, { type: string }> = {};
        const required: string[] = [];
        
        for (const [key, type] of Object.entries(inputSchema)) {
          properties[key] = {
            type: type === "json" ? "object" : type
          };
          required.push(key);
        }
        
        const jsonSchema = {
          type: "object",
          properties,
          ...(required.length > 0 ? { required } : {})
        };
        
        return {
          name: t.name,
          description: t.description,
          inputSchema: jsonSchema
        };
      });
      return { jsonrpc: "2.0", id, result: { tools: items } };
    }

    if (req.method === "upstreams/status") {
      const items = getUpstreamStatus();
      return { jsonrpc: "2.0", id, result: { upstreams: items } };
    }

    if (req.method === "tools/call") {
      const p = (req.params ?? {}) as Record<string, unknown>;
      const name = String(p.name ?? "");
      const arguments_ = (p.arguments ?? {}) as Record<string, unknown>;
      const tool = (await getAllTools()).find((t) => t.name === name);
      if (!tool) return err(id, -32601, "Tool not found");
      try {
        const r = await tool.handler(arguments_);
        return { 
          jsonrpc: "2.0", 
          id, 
          result: { 
            content: [{ type: "text", text: r.text }], 
            isError: r.isError ?? false 
          } 
        } as unknown as JsonRpcResponse;
      } catch (e) {
        return err(id, -32000, "Tool call failed", { error: String(e) });
      }
    }

    if (req.method === "resources/list") {
      const items = await listAggregatedResources();
      return { jsonrpc: "2.0", id, result: { resources: items } };
    }
    if (req.method === "resources/read") {
      const p = (req.params ?? {}) as Record<string, unknown>;
      const uri = String(p.uri ?? "");
      if (!uri) return err(id, -32602, "Missing uri parameter");
      
      try {
        // 直接处理资源读取逻辑
        if (uri.startsWith('upstream://')) {
          // 上游资源桥接
          const parts = uri.replace('upstream://', '').split('/');
          if (parts.length < 2) {
            return err(id, -32602, "Invalid upstream resource URI format");
          }
          
          const upstreamName = parts[0];
          const encodedOriginalUri = parts.slice(1).join('/');
          
          try {
            const originalUri = (globalThis as Record<string, unknown>).atob ? 
              (globalThis as { atob: (s: string) => string }).atob(encodedOriginalUri) : 
              encodedOriginalUri;
            const { readAggregatedResource } = await import("@server/upstream/index.ts");
            const result = await readAggregatedResource(upstreamName, originalUri);
            
            return { 
              jsonrpc: "2.0", 
              id, 
              result 
            };
          } catch (e) {
            return err(id, -32000, "Failed to read upstream resource", { error: String(e) });
          }
        } else if (uri.startsWith('config://')) {
          // 配置资源
          const { getConfigSync, loadConfig } = await import("@server/config.ts");
          const config = getConfigSync() ?? await loadConfig();
          return { 
            jsonrpc: "2.0", 
            id, 
            result: { 
              contents: [{ uri, text: JSON.stringify(config, null, 2) }] 
            } 
          };
        } else if (uri.startsWith('greeting://')) {
          // 问候资源
          const name = uri.replace('greeting://', '');
          return { 
            jsonrpc: "2.0", 
            id, 
            result: { 
              contents: [{ uri, text: `Hello, ${name}!` }] 
            } 
          };
        } else if (uri.startsWith('filex://')) {
          // 文件资源
          const path = uri.replace('filex://', '');
          try {
            const text = await Deno.readTextFile(String(path));
            return { 
              jsonrpc: "2.0", 
              id, 
              result: { 
                contents: [{ uri, text }] 
              } 
            };
          } catch (e) {
            return err(id, -32000, "Failed to read file", { error: String(e) });
          }
        } else {
          return err(id, -32601, "Unsupported resource URI scheme");
        }
      } catch (e) {
        return err(id, -32000, "Resource read failed", { error: String(e) });
      }
    }

    if (req.method === "prompts/list") {
      const items = await listAggregatedPrompts();
      return { jsonrpc: "2.0", id, result: { prompts: items } };
    }
    if (req.method === "prompts/get") {
      const p = (req.params ?? {}) as Record<string, unknown>;
      const name = String(p.name ?? "");
      const arguments_ = (p.arguments ?? {}) as Record<string, unknown>;
      if (!name) return err(id, -32602, "Missing name parameter");
      
      try {
        // 简化处理：从聚合提示词中查找
        const prompts = await listAggregatedPrompts();
        const prompt = prompts.find(pr => pr.name === name);
        if (!prompt) return err(id, -32601, "Prompt not found");
        
        const r = await getAggregatedPrompt(prompt.upstream, name, arguments_);
        const safe = { messages: Array.isArray(r.messages) ? r.messages as JsonValue[] : [] } as { messages: JsonValue[] };
        return { jsonrpc: "2.0", id, result: safe };
      } catch (e) {
        return err(id, -32000, "Prompt get failed", { error: String(e) });
      }
    }

    return err(id, -32601, "Method not found");
  } catch (e) {
    logError("mcp-http", "handler error", { error: String(e) });
    return err(id, -32603, "Internal error");
  }
}

export async function handleRpcPayload(bodyText: string): Promise<string> {
  if (!bodyText.trim()) {
    return JSON.stringify(err(null, -32600, "Invalid Request"));
  }
  let data: unknown;
  try {
    data = JSON.parse(bodyText);
  } catch {
    return JSON.stringify(err(null, -32700, "Parse error"));
  }

  if (Array.isArray(data)) {
    const arr = data.filter(isObject) as JsonRpcRequest[];
    const out: JsonRpcResponse[] = [];
    for (const item of arr) out.push(await handleOne(item));
    return JSON.stringify(out);
  }
  if (isObject(data)) {
    const res = await handleOne(data as JsonRpcRequest);
    return JSON.stringify(res);
  }
  return JSON.stringify(err(null, -32600, "Invalid Request"));
}



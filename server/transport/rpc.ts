import { getAllTools } from "@server/tools.ts";
import { logError } from "@server/logger.ts";
import { getUpstreamStatus } from "@server/upstream/metrics.ts";
import { listAggregatedResources, listAggregatedPrompts, getAggregatedPrompt } from "@server/upstream/index.ts";

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
            name: "deno-mcp-server",
            version: "0.1.0"
          }
        }
      };
    }

    // MCP 标准通知处理
    if (req.method === "notifications/initialized") {
      // initialized 是通知，不需要响应
      return { jsonrpc: "2.0", id, result: null };
    }

    if (req.method === "tools/list") {
      const items = (await getAllTools()).map((t) => {
        // 将简化的 inputSchema 转换为标准 JSON Schema 格式
        const inputSchema = t.inputSchema ?? {};
        const properties: Record<string, any> = {};
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
      
      // 简化处理：直接从本地资源读取，不需要 upstream 参数
      try {
        // 这里应该根据实际的资源读取逻辑来实现
        return { 
          jsonrpc: "2.0", 
          id, 
          result: { 
            contents: [{ uri, text: "Resource content placeholder" }] 
          } 
        };
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



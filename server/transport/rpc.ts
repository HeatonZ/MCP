import { getAllTools } from "@server/tools.ts";
import { logError } from "@server/logger.ts";
import { getUpstreamStatus } from "@server/upstream/metrics.ts";
import { listAggregatedResources, listAggregatedPrompts, getAggregatedPrompt } from "@server/upstream/index.ts";
import { getConfigSync } from "@server/config.ts";
import { getServerInfo, getServerCapabilities, getFullServerInfo } from "@server/server_info.ts";

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
      
      const serverInfo = await getServerInfo();
      const capabilities = await getServerCapabilities();
      
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion,
          capabilities,
          serverInfo
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
        const schema = t.inputSchema;
        const properties: Record<string, { type: string }> = {};
        const required = schema?.required ?? [];

        if (schema) {
          for (const [key, type] of Object.entries(schema.properties)) {
            properties[key] = {
              type: type === "json" ? "object" : type
            };
          }
        }

        const jsonSchema = schema
          ? {
              type: "object",
              properties,
              ...(required.length > 0 ? { required } : {})
            }
          : undefined;

        return {
          name: t.name,
          description: t.description,
          ...(jsonSchema ? { inputSchema: jsonSchema } : {})
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
      try {
        const upstreamItems = await listAggregatedResources();
        // 添加本地resources（避免 Cursor 的 fetch failed 错误）
        const localResources = [
          {
            uri: "config://app",
            name: "应用配置",
            description: "当前应用配置",
            mimeType: "application/json"
          },
          {
            uri: "info://server",
            name: "服务器信息",
            description: "MCP 服务器的基本信息和状态",
            mimeType: "application/json"
          },
          {
            uri: "help://usage",
            name: "使用帮助",
            description: "MCP 服务器使用说明",
            mimeType: "text/markdown"
          }
        ];
        const items = [...localResources, ...upstreamItems];
        return { jsonrpc: "2.0", id, result: { resources: items } };
      } catch (e) {
        logError("mcp-http", "resources/list failed", { error: String(e) });
        // 即使出错也返回本地resources
        return { jsonrpc: "2.0", id, result: { resources: [
          { uri: "config://app", name: "应用配置", mimeType: "application/json" },
          { uri: "info://server", name: "服务器信息", mimeType: "application/json" },
          { uri: "help://usage", name: "使用帮助", mimeType: "text/markdown" }
        ] } };
      }
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
        } else if (uri.startsWith('info://')) {
          // 服务器信息资源
          const info = await getFullServerInfo();
          return { 
            jsonrpc: "2.0", 
            id, 
            result: { 
              contents: [{ uri, text: JSON.stringify(info, null, 2), mimeType: "application/json" }] 
            } 
          };
        } else if (uri.startsWith('help://')) {
          // 帮助资源
          const tools = await getAllTools();
          const toolCount = tools.length;
          const helpText = `# MCP 服务器使用帮助

## 可用资源

- \`config://app\` - 应用配置
- \`info://server\` - 服务器信息  
- \`help://usage\` - 使用帮助

## 可用提示词

- \`review-code\` - 代码审查
- \`explain-code\` - 代码解释
- \`optimize-code\` - 代码优化

## 可用工具

当前已注册 ${toolCount} 个工具，查看 tools/list 获取完整工具列表
`;
          return { 
            jsonrpc: "2.0", 
            id, 
            result: { 
              contents: [{ uri, text: helpText, mimeType: "text/markdown" }] 
            } 
          };
        } else {
          return err(id, -32601, "Unsupported resource URI scheme");
        }
      } catch (e) {
        return err(id, -32000, "Resource read failed", { error: String(e) });
      }
    }

    if (req.method === "prompts/list") {
      try {
        const upstreamItems = await listAggregatedPrompts();
        // 添加本地prompts（避免 Cursor 的 fetch failed 错误）
        const localPrompts = [
          {
            name: "review-code",
            description: "审查代码质量和潜在问题",
            arguments: [{ name: "code", description: "要审查的代码", required: true }]
          },
          {
            name: "explain-code",
            description: "解释代码的功能和实现",
            arguments: [{ name: "code", description: "要解释的代码", required: true }]
          },
          {
            name: "optimize-code",
            description: "提供代码优化建议",
            arguments: [{ name: "code", description: "要优化的代码", required: true }]
          }
        ];
        const items = [...localPrompts, ...upstreamItems];
        return { jsonrpc: "2.0", id, result: { prompts: items } };
      } catch (e) {
        logError("mcp-http", "prompts/list failed", { error: String(e) });
        // 即使出错也返回本地prompts
        return { jsonrpc: "2.0", id, result: { prompts: [
          { name: "review-code", description: "审查代码质量和潜在问题" },
          { name: "explain-code", description: "解释代码的功能和实现" },
          { name: "optimize-code", description: "提供代码优化建议" }
        ] } };
      }
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



import { getAllTools } from "@server/tools.ts";
import { logError } from "@server/logger.ts";
import { getUpstreamStatus } from "@server/upstream/metrics.ts";
import { listAggregatedResources, readAggregatedResource, listAggregatedPrompts, getAggregatedPrompt } from "@server/upstream/index.ts";

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
    if (req.method === "tools/list") {
      const items = (await getAllTools()).map((t) => ({
        name: t.name,
        title: t.title,
        description: t.description,
        inputSchema: t.inputSchema ?? null,
      }));
      return { jsonrpc: "2.0", id, result: { tools: items } };
    }

    if (req.method === "upstreams/status") {
      const items = getUpstreamStatus();
      return { jsonrpc: "2.0", id, result: { upstreams: items } };
    }

    if (req.method === "tools/call") {
      const p = (req.params ?? {}) as Record<string, unknown>;
      const name = String(p.name ?? "");
      const args = (p.args ?? {}) as Record<string, unknown>;
      const tool = (await getAllTools()).find((t) => t.name === name);
      if (!tool) return err(id, -32601, "Tool not found");
      try {
        const r = await tool.handler(args);
        return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: r.text }], isError: r.isError ?? false } } as unknown as JsonRpcResponse;
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
      const upstream = String(p.upstream ?? "");
      const uri = String(p.uri ?? "");
      if (!upstream || !uri) return err(id, -32602, "Missing upstream or uri");
      const r = await readAggregatedResource(upstream, uri);
      return { jsonrpc: "2.0", id, result: r };
    }

    if (req.method === "prompts/list") {
      const items = await listAggregatedPrompts();
      return { jsonrpc: "2.0", id, result: { prompts: items } };
    }
    if (req.method === "prompts/get") {
      const p = (req.params ?? {}) as Record<string, unknown>;
      const upstream = String(p.upstream ?? "");
      const name = String(p.name ?? "");
      const args = (p.args ?? {}) as Record<string, unknown>;
      if (!upstream || !name) return err(id, -32602, "Missing upstream or name");
      const r = await getAggregatedPrompt(upstream, name, args);
      // ensure JSON-RPC result is JSON-serializable
      const safe = { messages: Array.isArray(r.messages) ? r.messages as JsonValue[] : [] } as { messages: JsonValue[] };
      return { jsonrpc: "2.0", id, result: safe };
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



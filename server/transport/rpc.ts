import { getAllTools } from "@server/tools.ts";
import { logError } from "@server/logger.ts";

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



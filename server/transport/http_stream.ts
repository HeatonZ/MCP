import type { McpServer } from "npm:@modelcontextprotocol/sdk/server/mcp.js";
import { logError, logInfo } from "@server/logger.ts";
import { handleRpcPayload } from "@server/transport/rpc.ts";

const encoder = new TextEncoder();

function isNdjsonRequest(req: Request): boolean {
  const ct = (req.headers.get("Content-Type") || "").toLowerCase();
  const accept = (req.headers.get("Accept") || "").toLowerCase();
  const url = new URL(req.url);
  const q = (url.searchParams.get("stream") || "").toLowerCase();
  return ct.includes("application/x-ndjson") || accept.includes("application/x-ndjson") || q === "1" || q === "true";
}

function createLineSplitter(): TransformStream<string, string> {
  let buffer = "";
  return new TransformStream<string, string>({
    transform(chunk, controller) {
      buffer += chunk;
      for (;;) {
        const lf = buffer.indexOf("\n");
        if (lf < 0) break;
        const line = buffer.slice(0, lf).replace(/\r$/, "").trim();
        buffer = buffer.slice(lf + 1);
        if (line) controller.enqueue(line);
      }
    },
    flush(controller) {
      const line = buffer.replace(/\r$/, "").trim();
      if (line) controller.enqueue(line);
    }
  });
}

export async function handleHttpRpc(_server: McpServer, req: Request): Promise<Response> {
  try {
    // 支持 Streamable HTTP：当 Content-Type/Accept 为 x-ndjson 或 ?stream=1 时，使用 NDJSON 双向流
    if (isNdjsonRequest(req)) {
      const body = req.body;
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          // 异步处理以便持续写入分块
          (async () => {
            try {
              if (body) {
                // 如果请求是 NDJSON，则逐行处理；否则将整个 JSON 拆分为逐项处理
                const contentType = (req.headers.get("Content-Type") || "").toLowerCase();
                if (contentType.includes("application/x-ndjson")) {
                  const textStream = body
                    .pipeThrough(new TextDecoderStream())
                    .pipeThrough(createLineSplitter());
                  const reader = textStream.getReader();
                  for (;;) {
                    const { value, done } = await reader.read();
                    if (done) break;
                    try {
                      const out = await handleRpcPayload(value);
                      controller.enqueue(encoder.encode(out + "\n"));
                    } catch (e) {
                      controller.enqueue(encoder.encode(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32000, message: String(e) } }) + "\n"));
                    }
                  }
                } else {
                  const text = await new Response(body).text();
                  try {
                    const data = JSON.parse(text);
                    if (Array.isArray(data)) {
                      for (const item of data) {
                        try {
                          const out = await handleRpcPayload(JSON.stringify(item));
                          controller.enqueue(encoder.encode(out + "\n"));
                        } catch (e) {
                          controller.enqueue(encoder.encode(JSON.stringify({ jsonrpc: "2.0", id: (item && item.id) ?? null, error: { code: -32000, message: String(e) } }) + "\n"));
                        }
                      }
                    } else {
                      const out = await handleRpcPayload(JSON.stringify(data));
                      controller.enqueue(encoder.encode(out + "\n"));
                    }
                  } catch (_) {
                    // 不是 JSON：作为原样文本请求处理
                    const out = await handleRpcPayload(text);
                    controller.enqueue(encoder.encode(out + "\n"));
                  }
                }
              } else {
                // 无请求体，返回错误
                controller.enqueue(encoder.encode(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid Request" } }) + "\n"));
              }
              logInfo("mcp-http", "rpc stream end", {});
              controller.close();
            } catch (e) {
              logError("mcp-http", "rpc stream failed", { error: String(e) });
              try {
                controller.enqueue(encoder.encode(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32000, message: String(e) } }) + "\n"));
              } catch (_) { /* ignore */ }
              try { controller.close(); } catch (_) { /* ignore */ }
            }
          })();
        },
      });
      return new Response(stream, {
        headers: {
          "Content-Type": "application/x-ndjson; charset=utf-8",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        },
      });
    }

    // 兼容非流式 JSON
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



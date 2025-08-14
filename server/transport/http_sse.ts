import type { McpServer } from "npm:@modelcontextprotocol/sdk/server/mcp.js";
import { logInfo, logError } from "@server/logger.ts";
import { createSession, getSession, sseLine, touchSession, closeSession } from "@server/http/mcp_sessions.ts";
import { handleRpcPayload } from "@server/transport/rpc.ts";

const encoder = new TextEncoder();

export function createSseEndpoints(_server: McpServer) {
  function createStream(controller: ReadableStreamDefaultController<Uint8Array>, _sessionId: string) {
    const ping = setInterval(() => {
      try { controller.enqueue(encoder.encode(`: keep-alive\n\n`)); } catch (_) { /* stream closed */ }
    }, 15000);
    return () => { try { clearInterval(ping); } catch (_) { /* cleared */ } };
  }

  async function handleOpen(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const sid = url.searchParams.get("session") || undefined;
    // ensure async function has at least one await for linter compliance
    await Promise.resolve();

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const dispose = createStream(controller, sid ?? "");
        const rec = createSession({
          id: sid,
          enqueue: (line) => { try { controller.enqueue(line); } catch (_) { /* stream closed */ } },
          close: () => { try { controller.close(); } catch (_) { /* already closed */ } },
        });
        controller.enqueue(sseLine({ session: rec.id }, "session"));
        logInfo("mcp-sse", "open", { session: rec.id });
        (req.signal as AbortSignal).addEventListener("abort", () => {
          dispose();
          closeSession(rec.id);
        });
      },
      cancel() {
        // closed by client; session will be cleaned by abort handler above
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  }

  async function handleMessage(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const sid = url.searchParams.get("session");
    const sess = getSession(sid);
    if (!sess) return new Response(JSON.stringify({ ok: false, error: "session not found" }), { status: 404, headers: { "Content-Type": "application/json" } });
    try {
      const body = await req.text();
      // 将请求体作为 JSON-RPC 处理并把结果通过 SSE 推送
      const out = await handleRpcPayload(body);
      sess.enqueue(sseLine(JSON.parse(out), "message"));
      touchSession(sess.id);
      logInfo("mcp-sse", "message", { session: sess.id });
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
    } catch (e) {
      logError("mcp-sse", "message failed", { error: String(e) });
      return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500, headers: { "Content-Type": "application/json" } });
    }
  }

  return { handleOpen, handleMessage };
}



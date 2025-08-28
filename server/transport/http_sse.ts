import type { McpServer } from "npm:@modelcontextprotocol/sdk/server/mcp.js";
import { logInfo, logError } from "@server/logger.ts";
import { createSession, getSession, sseLine, touchSession, closeSession } from "@server/http/mcp_sessions.ts";
import { handleRpcPayload } from "@server/transport/rpc.ts";

const encoder = new TextEncoder();

export function createSseEndpoints(_server: McpServer) {
  function createStream(controller: ReadableStreamDefaultController<Uint8Array>, sessionId: string) {
    let pingCount = 0;
    const ping = setInterval(() => {
      try { 
        pingCount++;
        controller.enqueue(encoder.encode(`: keep-alive-${pingCount} ${Date.now()}\n\n`)); 
        logInfo("mcp-sse", "heartbeat sent", { sessionId, pingCount });
      } catch (error) { 
        logError("mcp-sse", "heartbeat failed", { sessionId, error: String(error) });
        clearInterval(ping);
      }
    }, 10000); // 从15秒缩短到10秒
    return () => { 
      try { 
        clearInterval(ping); 
        logInfo("mcp-sse", "heartbeat stopped", { sessionId, totalPings: pingCount });
      } catch (_) { /* cleared */ } 
    };
  }

  async function handleOpen(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const sid = url.searchParams.get("session") || undefined;
    // ensure async function has at least one await for linter compliance
    await Promise.resolve();

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const rec = createSession({
          id: sid,
          enqueue: (line) => { try { controller.enqueue(line); } catch (_) { /* stream closed */ } },
          close: () => { try { controller.close(); } catch (_) { /* already closed */ } },
        });
        const dispose = createStream(controller, rec.id);
        controller.enqueue(sseLine({ session: rec.id }, "session"));
        logInfo("mcp-sse", "open", { session: rec.id });
        const cleanup = () => {
          dispose();
          closeSession(rec.id);
          logInfo("mcp-sse", "connection cleanup completed", { sessionId: rec.id });
        };
        
        (req.signal as AbortSignal).addEventListener("abort", cleanup);
        
        // 添加错误处理 - 注意：ReadableStreamDefaultController没有addEventListener
        // 错误处理将通过try-catch和abort信号来实现
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



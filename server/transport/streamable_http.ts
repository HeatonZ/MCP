import type { McpServer } from "npm:@modelcontextprotocol/sdk/server/mcp.js";
import { logInfo, logError } from "@server/logger.ts";
import { handleRpcPayload } from "@server/transport/rpc.ts";
import { getConfigSync } from "@server/config.ts";

const encoder = new TextEncoder();

// 会话管理
type StreamableSession = {
  id: string;
  createdAt: number;
  lastSeenAt: number;
  controller?: ReadableStreamDefaultController<Uint8Array>;
  isStreaming: boolean;
};

const sessions = new Map<string, StreamableSession>();

function generateSessionId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
}

function getOrCreateSession(sessionId?: string): StreamableSession {
  if (sessionId && sessions.has(sessionId)) {
    const session = sessions.get(sessionId)!;
    session.lastSeenAt = Date.now();
    return session;
  }
  
  const newSessionId = sessionId || generateSessionId();
  const session: StreamableSession = {
    id: newSessionId,
    createdAt: Date.now(),
    lastSeenAt: Date.now(),
    isStreaming: false,
  };
  
  sessions.set(newSessionId, session);
  logInfo("streamable-http", "session created", { sessionId: newSessionId });
  return session;
}

function cleanupExpiredSessions() {
  const now = Date.now();
  const maxAge = 30 * 60 * 1000; // 30 minutes
  
  for (const [sessionId, session] of sessions.entries()) {
    if (now - session.lastSeenAt > maxAge) {
      if (session.controller) {
        try {
          session.controller.close();
        } catch (_) {
          // ignore
        }
      }
      sessions.delete(sessionId);
      logInfo("streamable-http", "session expired", { sessionId });
    }
  }
}

// 定期清理过期会话
setInterval(cleanupExpiredSessions, 5 * 60 * 1000); // 每5分钟清理一次

export async function handleStreamableHttp(_server: McpServer, req: Request): Promise<Response> {
  try {
    const sessionId = req.headers.get("Mcp-Session-Id");
    const session = getOrCreateSession(sessionId || undefined);
    
    const body = await req.text();
    logInfo("streamable-http", "POST request", { sessionId: session.id, bodyLength: body.length });
    
    // 处理 JSON-RPC 请求
    const result = await handleRpcPayload(body);
    
    // 检查是否需要升级为流式响应
    const shouldStream = req.headers.get("Accept")?.includes("text/event-stream") || 
                        req.headers.get("X-Stream") === "true";
    
    if (shouldStream) {
      // 升级为 SSE 流式响应
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          session.controller = controller;
          session.isStreaming = true;
          
          // 发送会话 ID
          controller.enqueue(encoder.encode(`event: session\n`));
          controller.enqueue(encoder.encode(`data: {"sessionId":"${session.id}"}\n\n`));
          
          // 发送响应数据
          controller.enqueue(encoder.encode(`event: message\n`));
          controller.enqueue(encoder.encode(`data: ${result}\n\n`));
          
          // 设置定期 ping
          const pingInterval = setInterval(() => {
            try {
              controller.enqueue(encoder.encode(`: ping\n\n`));
            } catch (_) {
              clearInterval(pingInterval);
            }
          }, 15000);
          
          // 清理处理
          req.signal.addEventListener("abort", () => {
            clearInterval(pingInterval);
            session.isStreaming = false;
            session.controller = undefined;
            try {
              controller.close();
            } catch (_) {
              // ignore
            }
          });
        },
      });
      
      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
          "Mcp-Session-Id": session.id,
        },
      });
    } else {
      // 标准 HTTP 响应
      return new Response(result, {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Mcp-Session-Id": session.id,
        },
      });
    }
  } catch (e) {
    logError("streamable-http", "POST failed", { error: String(e) });
    return new Response(
      JSON.stringify({ 
        jsonrpc: "2.0", 
        id: null, 
        error: { code: -32603, message: "Internal error" } 
      }), 
      { 
        status: 500, 
        headers: { "Content-Type": "application/json" } 
      }
    );
  }
}

export function handleStreamableHttpGet(_server: McpServer, req: Request): Response {
  try {
    const url = new URL(req.url);
    const sessionId = url.searchParams.get("session") || req.headers.get("Mcp-Session-Id");
    const session = getOrCreateSession(sessionId || undefined);
    
    logInfo("streamable-http", "GET request (SSE)", { sessionId: session.id });
    
    // 建立 SSE 连接
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        session.controller = controller;
        session.isStreaming = true;
        
        // 发送会话信息
        controller.enqueue(encoder.encode(`event: session\n`));
        controller.enqueue(encoder.encode(`data: {"sessionId":"${session.id}"}\n\n`));
        
        // 发送服务器信息
        const cfg = getConfigSync();
        const serverInfo = {
          name: cfg?.serverName ?? "deno-mcp-server",
          version: cfg?.version ?? "0.1.0",
          capabilities: {
            tools: {},
            resources: {},
            prompts: {},
            logging: {}
          }
        };
        controller.enqueue(encoder.encode(`event: serverInfo\n`));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(serverInfo)}\n\n`));
        
        // 设置定期 ping
        const pingInterval = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(`: ping\n\n`));
          } catch (_) {
            clearInterval(pingInterval);
          }
        }, 15000);
        
        // 清理处理
        req.signal.addEventListener("abort", () => {
          clearInterval(pingInterval);
          session.isStreaming = false;
          session.controller = undefined;
          try {
            controller.close();
          } catch (_) {
            // ignore
          }
          logInfo("streamable-http", "SSE connection closed", { sessionId: session.id });
        });
      },
    });
    
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "Mcp-Session-Id": session.id,
      },
    });
  } catch (e) {
    logError("streamable-http", "GET failed", { error: String(e) });
    return new Response("Internal Server Error", { status: 500 });
  }
}

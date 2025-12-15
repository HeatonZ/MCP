import type { McpServer } from "npm:@modelcontextprotocol/sdk@1.24.3/server/mcp.js";
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
  const warningAge = 25 * 60 * 1000; // 25 minutes - 提前警告
  
  for (const [sessionId, session] of sessions.entries()) {
    const age = now - session.lastSeenAt;
    
    if (age > maxAge) {
      if (session.controller) {
        try {
          // 发送会话即将过期的通知
          session.controller.enqueue(encoder.encode(`event: session_expired\ndata: {"reason":"timeout","sessionId":"${sessionId}"}\n\n`));
          session.controller.close();
        } catch (_) {
          // ignore
        }
      }
      sessions.delete(sessionId);
      logInfo("streamable-http", "session expired", { sessionId, ageMinutes: Math.round(age / 60000) });
    } else if (age > warningAge && session.controller) {
      try {
        // 发送会话即将过期的警告
        session.controller.enqueue(encoder.encode(`event: session_warning\ndata: {"reason":"expiring_soon","sessionId":"${sessionId}","expiresIn":${maxAge - age}}\n\n`));
      } catch (_) {
        // ignore
      }
    }
  }
}

// 定期清理过期会话 - 增加频率以提高响应性
setInterval(cleanupExpiredSessions, 2 * 60 * 1000); // 每2分钟清理一次

// 添加连接健康检查
function performHealthCheck() {
  const now = Date.now();
  const staleThreshold = 60 * 1000; // 1分钟无活动视为可能有问题
  
  for (const [sessionId, session] of sessions.entries()) {
    if (session.isStreaming && session.controller && (now - session.lastSeenAt > staleThreshold)) {
      try {
        // 发送健康检查ping
        session.controller.enqueue(encoder.encode(`event: health_check\ndata: {"timestamp":${now},"sessionId":"${sessionId}"}\n\n`));
        logInfo("streamable-http", "health check sent", { sessionId });
      } catch (error) {
        logError("streamable-http", "health check failed", { sessionId, error: String(error) });
        // 健康检查失败，清理会话
        session.isStreaming = false;
        session.controller = undefined;
        sessions.delete(sessionId);
      }
    }
  }
}

// 每30秒进行一次健康检查
setInterval(performHealthCheck, 30 * 1000);

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
          
                  // 设置定期 ping - 缩短间隔提高连接稳定性
        const pingInterval = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(`: ping ${Date.now()}\n\n`));
            // 更新会话活跃时间
            session.lastSeenAt = Date.now();
          } catch (error) {
            logError("streamable-http", "ping failed", { sessionId: session.id, error: String(error) });
            clearInterval(pingInterval);
          }
        }, 10000); // 从15秒缩短到10秒
          
          // 清理处理 - 增强错误处理和日志
          const cleanup = () => {
            clearInterval(pingInterval);
            session.isStreaming = false;
            session.controller = undefined;
            try {
              controller.close();
            } catch (_) {
              // ignore
            }
            logInfo("streamable-http", "POST SSE connection closed", { sessionId: session.id });
          };
          
          req.signal.addEventListener("abort", cleanup);
          
          // 添加错误处理 - 注意：ReadableStreamDefaultController没有addEventListener
          // 错误处理将通过try-catch和abort信号来实现
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
        
        // 设置定期 ping - 缩短间隔提高连接稳定性
        const pingInterval = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(`: ping ${Date.now()}\n\n`));
            // 更新会话活跃时间
            session.lastSeenAt = Date.now();
          } catch (error) {
            logError("streamable-http", "ping failed", { sessionId: session.id, error: String(error) });
            clearInterval(pingInterval);
          }
        }, 10000); // 从15秒缩短到10秒
        
        // 清理处理 - 增强错误处理和日志
        const cleanup = () => {
          clearInterval(pingInterval);
          session.isStreaming = false;
          session.controller = undefined;
          try {
            controller.close();
          } catch (_) {
            // ignore
          }
          logInfo("streamable-http", "GET SSE connection closed", { sessionId: session.id });
        };
        
        req.signal.addEventListener("abort", cleanup);
        
        // 添加错误处理 - 注意：ReadableStreamDefaultController没有addEventListener
        // 错误处理将通过try-catch和abort信号来实现
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

import { loadConfig, saveConfig, getConfigSync, startConfigWatcher } from "@server/config.ts";
import { join, fromFileUrl, extname } from "https://deno.land/std@0.224.0/path/mod.ts";
import { getAllTools, initPlugins, disposePlugins } from "@server/tools.ts";
import { createMcpServer } from "@server/mcp.ts";
import { createSseEndpoints } from "@server/transport/http_sse.ts";
import { handleHttpRpc } from "@server/transport/http_stream.ts";
import { handleStreamableHttp, handleStreamableHttpGet } from "@server/transport/streamable_http.ts";
import { handleRpcPayload } from "@server/transport/rpc.ts";
import { reconnectUpstream } from "@server/upstream/index.ts";
import { createLogStream, getSnapshot, logError, logInfo } from "@server/logger.ts";
import { safeResolve, listFilesRecursive } from "@server/security/paths.ts";
import { requireAuth, handleLogin, handleLogout, getAuthStatus } from "@server/auth.ts";
import { testUpstreamConnection, testToolCall, testResourceRead, testPromptGet } from "@server/test_api.ts";

function isOriginAllowed(origin: string, allowedOrigins: string[]): boolean {
  for (const allowed of allowedOrigins) {
    if (allowed === "*") return true;
    if (allowed === origin) return true;
    
    // 支持通配符匹配，如 https://*.heatonz.deno.net
    if (allowed.includes("*")) {
      const pattern = allowed.replace(/\*/g, ".*");
      const regex = new RegExp(`^${pattern}$`);
      if (regex.test(origin)) return true;
    }
  }
  return false;
}

function corsHeaders(origin: string | null, allowedOrigins: string[] | undefined): HeadersInit {
  let allow = "*";
  
  if (allowedOrigins && allowedOrigins.length > 0) {
    if (allowedOrigins[0] === "*") {
      allow = origin ?? "*";
    } else if (origin && isOriginAllowed(origin, allowedOrigins)) {
      allow = origin;
    } else {
      allow = "";
    }
  } else {
    allow = origin ?? "*";
  }
  
  return {
    "Access-Control-Allow-Origin": allow || "*",
    "Access-Control-Allow-Methods": "GET,PUT,POST,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
  };
}

function projectRoot(): string {
  const here = new URL("./", import.meta.url);
  const root = new URL("../", here);
  return fromFileUrl(root);
}

function contentTypeByExt(p: string): string {
  const ext = extname(p).toLowerCase();
  switch (ext) {
    case ".html": return "text/html; charset=utf-8";
    case ".js": return "text/javascript; charset=utf-8";
    case ".css": return "text/css; charset=utf-8";
    case ".json": return "application/json; charset=utf-8";
    case ".svg": return "image/svg+xml";
    default: return "text/plain; charset=utf-8";
  }
}

const cfg = await loadConfig();
const _cfgWatcher = startConfigWatcher();

// 记录服务器启动时间
(globalThis as Record<string, unknown>).__serverStartTime = Date.now();

// 创建全局单例 MCP 服务器实例，避免每次请求都重新创建
let globalMcpServer: Awaited<ReturnType<typeof createMcpServer>> | null = null;

export async function getGlobalMcpServer() {
  if (!globalMcpServer) {
    globalMcpServer = await createMcpServer();
  }
  return globalMcpServer;
}

async function routeRequest(req: Request, bootCfg: ReturnType<typeof getConfigSync> extends infer T ? (T extends null ? import("@shared/types/system.ts").AppConfig : import("@shared/types/system.ts").AppConfig) : import("@shared/types/system.ts").AppConfig): Promise<Response> {
  const url = new URL(req.url);
  const origin = req.headers.get("Origin");
  const currentCfg = getConfigSync() ?? bootCfg;
  const cors = currentCfg.cors?.allowedOrigins;
  const allowedDirs = currentCfg.security?.allowedDirs ?? ["server", "config"];

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(origin, cors) });
  }

  // MCP Streamable HTTP 统一端点 /message（符合新协议规范）
  if (url.pathname === "/message") {
    if (req.method === "POST") {
      if (currentCfg.features?.enableMcpHttp === false) {
        return new Response("MCP HTTP disabled", { status: 403, headers: corsHeaders(origin, cors) });
      }
      const server = await getGlobalMcpServer();
      const res = await handleStreamableHttp(server, req);
      return new Response(res.body, { status: res.status, headers: { ...Object.fromEntries(res.headers), ...corsHeaders(origin, cors) } });
    }
    if (req.method === "GET") {
      if (currentCfg.features?.enableMcpSse === false) {
        return new Response("MCP SSE disabled", { status: 403, headers: corsHeaders(origin, cors) });
      }
      const server = await getGlobalMcpServer();
      const res = handleStreamableHttpGet(server, req);
      return new Response(res.body, { status: res.status, headers: { ...Object.fromEntries(res.headers), ...corsHeaders(origin, cors) } });
    }
  }

  // MCP HTTP 传输端点（保持向后兼容）
  if (url.pathname === "/mcp") {
    if (req.method === "POST") {
      if (currentCfg.features?.enableMcpHttp === false) {
        return new Response("MCP HTTP disabled", { status: 403, headers: corsHeaders(origin, cors) });
      }
      const server = await getGlobalMcpServer();
      const res = await handleHttpRpc(server, req);
      return new Response(res.body, { status: res.status, headers: { ...Object.fromEntries(res.headers), ...corsHeaders(origin, cors) } });
    }
    if (req.method === "GET") {
      if (currentCfg.features?.enableMcpSse === false) {
        return new Response("MCP SSE disabled", { status: 403, headers: corsHeaders(origin, cors) });
      }
      const server = await getGlobalMcpServer();
      const { handleOpen } = createSseEndpoints(server);
      const res = await handleOpen(req);
      return new Response(res.body, { status: res.status, headers: { ...Object.fromEntries(res.headers), ...corsHeaders(origin, cors) } });
    }
  }

  if (url.pathname === "/mcp/sse") {
    if (currentCfg.features?.enableMcpSse === false) {
      return new Response("MCP SSE disabled", { status: 403, headers: corsHeaders(origin, cors) });
    }
    const server = await getGlobalMcpServer();
    const { handleOpen } = createSseEndpoints(server);
    const res = await handleOpen(req);
    return new Response(res.body, { status: res.status, headers: { ...Object.fromEntries(res.headers), ...corsHeaders(origin, cors) } });
  }

  if (url.pathname === "/mcp/message") {
    if (req.method === "POST") {
      if (currentCfg.features?.enableMcpSse === false) {
        return new Response("MCP SSE disabled", { status: 403, headers: corsHeaders(origin, cors) });
      }
      const server = await getGlobalMcpServer();
      const { handleMessage } = createSseEndpoints(server);
      const res = await handleMessage(req);
      return new Response(await res.text(), { status: res.status, headers: { ...Object.fromEntries(res.headers), ...corsHeaders(origin, cors) } });
    }
  }

  if (url.pathname === "/api/health") {
    // 增强健康检查，包含MCP连接状态
    const { getSessionStats } = await import("@server/http/mcp_sessions.ts");
    const sessionStats = getSessionStats();
    const health = {
      ok: true,
      timestamp: Date.now(),
      server: {
        name: currentCfg.serverName,
        version: currentCfg.version,
        uptime: Date.now() - ((globalThis as Record<string, unknown>).__serverStartTime as number || 0)
      },
      mcp: {
        sessions: sessionStats,
        endpoints: {
          http: currentCfg.features?.enableMcpHttp !== false,
          sse: currentCfg.features?.enableMcpSse !== false
        }
      }
    };
    return new Response(JSON.stringify(health, null, 2), { headers: { "Content-Type": "application/json", ...corsHeaders(origin, cors) } });
  }

  // 认证API路由
  if (url.pathname === "/api/auth/login") {
    if (req.method === "POST") {
      try {
        const loginData = await req.json();
        const result = handleLogin(loginData);
        return new Response(JSON.stringify(result), { 
          status: result.success ? 200 : 401,
          headers: { "Content-Type": "application/json", ...corsHeaders(origin, cors) } 
        });
      } catch (_e) {
        return new Response(JSON.stringify({ success: false, message: "Invalid request body" }), { 
          status: 400, 
          headers: { "Content-Type": "application/json", ...corsHeaders(origin, cors) } 
        });
      }
    }
  }

  if (url.pathname === "/api/auth/logout") {
    if (req.method === "POST") {
      const authHeader = req.headers.get("Authorization");
      const token = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : "";
      const result = handleLogout(token);
      return new Response(JSON.stringify(result), { 
        headers: { "Content-Type": "application/json", ...corsHeaders(origin, cors) } 
      });
    }
  }

  if (url.pathname === "/api/auth/status") {
    if (req.method === "GET") {
      const authHeader = req.headers.get("Authorization");
      const token = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : "";
      const status = getAuthStatus(token);
      return new Response(JSON.stringify(status), { 
        headers: { "Content-Type": "application/json", ...corsHeaders(origin, cors) } 
      });
    }
  }

  if (url.pathname === "/api/upstreams/status") {
    const out = await handleRpcPayload(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "upstreams/status" }));
    return new Response(out, { headers: { "Content-Type": "application/json", ...corsHeaders(origin, cors) } });
  }

  if (url.pathname === "/api/upstreams/reconnect") {
    if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405, headers: corsHeaders(origin, cors) });
    const name = new URL(req.url).searchParams.get("name") ?? "";
    if (!name) return new Response(JSON.stringify({ ok: false, error: "missing name" }), { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders(origin, cors) } });
    const ok = await reconnectUpstream(name);
    return new Response(JSON.stringify({ ok }), { headers: { "Content-Type": "application/json", ...corsHeaders(origin, cors) } });
  }

  // 对于需要认证的API路由，先检查认证状态（除了认证相关的API）
  if (url.pathname.startsWith("/api/") && 
      !url.pathname.startsWith("/api/auth/") && 
      !url.pathname.startsWith("/api/health")) {
    const auth = requireAuth(req);
    if (!auth.authenticated) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { 
        status: 401, 
        headers: { "Content-Type": "application/json", ...corsHeaders(origin, cors) } 
      });
    }
  }

  if (url.pathname.startsWith("/api/") && currentCfg.features?.enableHttpAdmin === false) {
    return new Response("Admin API disabled", { status: 403, headers: corsHeaders(origin, cors) });
  }

  // 测试API路由
  if (url.pathname === "/api/test/upstream") {
    if (req.method === "POST") {
      try {
        const testRequest = await req.json();
        const result = await testUpstreamConnection(testRequest);
        return new Response(JSON.stringify(result), { 
          headers: { "Content-Type": "application/json", ...corsHeaders(origin, cors) } 
        });
      } catch (_e) {
        return new Response(JSON.stringify({ success: false, message: String(_e) }), { 
          status: 500, 
          headers: { "Content-Type": "application/json", ...corsHeaders(origin, cors) } 
        });
      }
    }
  }

  if (url.pathname === "/api/test/tool") {
    if (req.method === "POST") {
      try {
        const testRequest = await req.json();
        const result = await testToolCall(testRequest);
        return new Response(JSON.stringify(result), { 
          headers: { "Content-Type": "application/json", ...corsHeaders(origin, cors) } 
        });
      } catch (_e) {
        return new Response(JSON.stringify({ success: false, message: String(_e) }), { 
          status: 500, 
          headers: { "Content-Type": "application/json", ...corsHeaders(origin, cors) } 
        });
      }
    }
  }

  if (url.pathname === "/api/test/resource") {
    if (req.method === "POST") {
      try {
        const testRequest = await req.json();
        const result = await testResourceRead(testRequest);
        return new Response(JSON.stringify(result), { 
          headers: { "Content-Type": "application/json", ...corsHeaders(origin, cors) } 
        });
      } catch (_e) {
        return new Response(JSON.stringify({ success: false, message: String(_e) }), { 
          status: 500, 
          headers: { "Content-Type": "application/json", ...corsHeaders(origin, cors) } 
        });
      }
    }
  }

  if (url.pathname === "/api/test/prompt") {
    if (req.method === "POST") {
      try {
        const testRequest = await req.json();
        const result = await testPromptGet(testRequest);
        return new Response(JSON.stringify(result), { 
          headers: { "Content-Type": "application/json", ...corsHeaders(origin, cors) } 
        });
      } catch (_e) {
        return new Response(JSON.stringify({ success: false, message: String(_e) }), { 
          status: 500, 
          headers: { "Content-Type": "application/json", ...corsHeaders(origin, cors) } 
        });
      }
    }
  }

  if (url.pathname === "/api/logs/sse") {
    // 对于SSE，检查URL参数中的token（因为EventSource不支持自定义头）
    const token = url.searchParams.get('token');
    
    if (token) {
      // 创建一个新的headers对象，包含Authorization头
      const headers = new Headers(req.headers);
      headers.set('Authorization', `Bearer ${token}`);
      
      
      const authReq = new Request(req.url, {
        method: req.method,
        headers: headers,
        body: req.body,
      });
      
      const auth = requireAuth(authReq);
      
      if (!auth.authenticated) {
        return new Response("Unauthorized", { status: 401, headers: corsHeaders(origin, cors) });
      }
    } else {
      const auth = requireAuth(req);
      if (!auth.authenticated) {
        return new Response("Unauthorized", { status: 401, headers: corsHeaders(origin, cors) });
      }
    }
    
    const controller = new AbortController();
    req.signal.addEventListener("abort", () => controller.abort());
    return createLogStream(controller.signal);
  }
  if (url.pathname === "/api/logs/snapshot") {
    return new Response(JSON.stringify(getSnapshot(), null, 2), { headers: { "Content-Type": "application/json", ...corsHeaders(origin, cors) } });
  }

  // MCP连接状态监控API
  if (url.pathname === "/api/mcp/sessions") {
    if (req.method === "GET") {
      const { getSessionStats } = await import("@server/http/mcp_sessions.ts");
      const stats = getSessionStats();
      return new Response(JSON.stringify(stats, null, 2), { headers: { "Content-Type": "application/json", ...corsHeaders(origin, cors) } });
    }
  }

  if (url.pathname === "/api/mcp/diagnostics") {
    if (req.method === "GET") {
      const diagnostics = {
        timestamp: Date.now(),
        server: globalMcpServer ? "initialized" : "not_initialized",
        config: {
          httpEnabled: currentCfg.features?.enableMcpHttp !== false,
          sseEnabled: currentCfg.features?.enableMcpSse !== false
        },
        upstreams: currentCfg.upstreams?.length || 0
      };
      return new Response(JSON.stringify(diagnostics, null, 2), { headers: { "Content-Type": "application/json", ...corsHeaders(origin, cors) } });
    }
  }

  if (url.pathname === "/api/config") {
    if (req.method === "GET") {
      const current = getConfigSync() ?? await loadConfig();
      return new Response(JSON.stringify(current, null, 2), { headers: { "Content-Type": "application/json", ...corsHeaders(origin, cors) } });
    }
    if (req.method === "PUT") {
      const next = await req.json();
      await saveConfig(next);
      logInfo("api", "config updated");
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json", ...corsHeaders(origin, cors) } });
    }
  }

  if (url.pathname === "/api/tools") {
    if (req.method === "GET") {
      const items = (await getAllTools()).map((t) => ({
        name: t.name,
        title: t.title,
        description: t.description,
        inputSchema: t.inputSchema ?? null,
      }));
      return new Response(JSON.stringify({ tools: items }, null, 2), { headers: { "Content-Type": "application/json", ...corsHeaders(origin, cors) } });
    }
  }

  if (url.pathname === "/api/tools/call") {
    if (req.method === "POST") {
      const body = await req.json();
      const name = String(body?.name ?? "");
      const args = (body?.args ?? {}) as Record<string, unknown>;
      const tool = (await getAllTools()).find((t) => t.name === name);
      if (!tool) return new Response("Tool not found", { status: 404, headers: corsHeaders(origin, cors) });
      try {
        const r = await tool.handler(args);
        logInfo("tool", `call ${name}` , { args });
        const payload = r.isError ? { ok: false, error: r.text } : { ok: true, result: r.text };
        return new Response(JSON.stringify(payload, null, 2), { headers: { "Content-Type": "application/json", ...corsHeaders(origin, cors) } });
      } catch (e) {
        logError("tool", `call failed ${name}` , { error: String(e) });
        return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders(origin, cors) } });
      }
    }
  }

  if (url.pathname === "/api/list") {
    const dir = url.searchParams.get("dir") ?? "server";
    const files = await listFilesRecursive(dir, allowedDirs);
    return new Response(JSON.stringify({ files }), { headers: { "Content-Type": "application/json", ...corsHeaders(origin, cors) } });
  }

  if (url.pathname === "/api/file") {
    if (req.method === "GET") {
      const rel = url.searchParams.get("path");
      if (!rel) return new Response("Missing path", { status: 400, headers: corsHeaders(origin, cors) });
      const resolved = safeResolve(rel, allowedDirs);
      if (!resolved.ok) return new Response(resolved.message, { status: 400, headers: corsHeaders(origin, cors) });
      try {
        const text = await Deno.readTextFile(resolved.path);
        return new Response(text, { headers: { "Content-Type": "text/plain; charset=utf-8", ...corsHeaders(origin, cors) } });
      } catch (e) {
        return new Response(String(e), { status: 404, headers: corsHeaders(origin, cors) });
      }
    }
    if (req.method === "PUT") {
      const body = await req.json();
      const rel = body?.path as string | undefined;
      const content = body?.content as string | undefined;
      if (!rel || content === undefined) return new Response("Invalid body", { status: 400, headers: corsHeaders(origin, cors) });
      const resolved = safeResolve(rel, allowedDirs);
      if (!resolved.ok) return new Response(resolved.message, { status: 400, headers: corsHeaders(origin, cors) });
      if (currentCfg.features?.enableCodeEditing === false) return new Response("Code editing disabled", { status: 403, headers: corsHeaders(origin, cors) });
      await Deno.writeTextFile(resolved.path, content);
      logInfo("api", "file saved", { path: rel } as Record<string, unknown>);
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json", ...corsHeaders(origin, cors) } });
    }
  }

  // 静态文件（生产）：/ -> public/index.html
  if (req.method === "GET") {
    const root = projectRoot();
    const assetPath = url.pathname === "/" ? "/index.html" : url.pathname;
    try {
      const content = await Deno.readFile(join(root, "public", assetPath));
      return new Response(content, { headers: { "Content-Type": contentTypeByExt(assetPath), ...corsHeaders(origin, cors) } });
    } catch {
      try {
        const content = await Deno.readFile(join(root, "public", "index.html"));
        return new Response(content, { headers: { "Content-Type": "text/html; charset=utf-8", ...corsHeaders(origin, cors) } });
      } catch {
        return new Response("Not Found", { status: 404, headers: corsHeaders(origin, cors) });
      }
    }
  }

  return new Response("Not Found", { status: 404, headers: corsHeaders(origin, cors) });
}
await initPlugins();

// 预先初始化全局 MCP 服务器实例，确保启动时就准备好
await getGlobalMcpServer();

// 检查端口是否被占用
async function checkPortInUse(port: number): Promise<boolean> {
  try {
    const conn = await Deno.connect({ hostname: "localhost", port });
    conn.close();
    return true; // 端口被占用
  } catch {
    return false; // 端口未被占用
  }
}

Deno.addSignalListener?.("SIGINT", () => { try { disposePlugins(); } catch (_) { /* ignore */ } Deno.exit(); });
Deno.addSignalListener?.("SIGTERM", () => { try { disposePlugins(); } catch (_) { /* ignore */ } Deno.exit(); });

// 启动前检查端口占用
const portInUse = await checkPortInUse(cfg.httpPort);
if (portInUse) {
  console.warn(`⚠️  警告：端口 ${cfg.httpPort} 已被占用，但仍继续启动服务`);
} else {
  console.log(`✅ 端口 ${cfg.httpPort} 可用`);
}

Deno.serve({ port: cfg.httpPort }, async (req) => {
  const started = Date.now();
  const res = await routeRequest(req, cfg);
  try {
    const url = new URL(req.url);
    logInfo("http", `${req.method} ${url.pathname} -> ${res.status}`, { ms: Date.now() - started });
  } catch (_) { /* ignore log errors */ }
  return res;
});

console.log(`HTTP admin server on http://localhost:${cfg.httpPort}`); 
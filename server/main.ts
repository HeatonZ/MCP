import { loadConfig, saveConfig, getConfigSync, startConfigWatcher } from "@server/config.ts";
import { join, fromFileUrl, extname } from "https://deno.land/std@0.224.0/path/mod.ts";
import { getAllTools, initPlugins, disposePlugins } from "@server/tools.ts";
import { createMcpServer } from "@server/mcp.ts";
import { createSseEndpoints } from "@server/transport/http_sse.ts";
import { handleHttpRpc } from "@server/transport/http_stream.ts";
import { handleRpcPayload } from "@server/transport/rpc.ts";
import { reconnectUpstream } from "@server/upstream/index.ts";
import { createLogStream, getSnapshot, logError, logInfo } from "@server/logger.ts";
import { safeResolve, listFilesRecursive } from "@server/security/paths.ts";

function corsHeaders(origin: string | null, allowedOrigins: string[] | undefined): HeadersInit {
  const allow = allowedOrigins && allowedOrigins.length && allowedOrigins[0] !== "*" ? (origin && allowedOrigins.includes(origin) ? origin : "") : (origin ?? "*");
  return {
    "Access-Control-Allow-Origin": allow || "*",
    "Access-Control-Allow-Methods": "GET,PUT,POST,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
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

async function routeRequest(req: Request, bootCfg: ReturnType<typeof getConfigSync> extends infer T ? (T extends null ? import("@shared/types/system.ts").AppConfig : import("@shared/types/system.ts").AppConfig) : import("@shared/types/system.ts").AppConfig): Promise<Response> {
  const url = new URL(req.url);
  const origin = req.headers.get("Origin");
  const currentCfg = getConfigSync() ?? bootCfg;
  const cors = currentCfg.cors?.allowedOrigins;
  const allowedDirs = currentCfg.security?.allowedDirs ?? ["server", "config"];

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(origin, cors) });
  }

  // MCP HTTP 传输端点（不属于 /api 管理端点）
  if (url.pathname === "/mcp") {
    if (req.method === "POST") {
      if (currentCfg.features?.enableMcpHttp === false) {
        return new Response("MCP HTTP disabled", { status: 403, headers: corsHeaders(origin, cors) });
      }
      const server = await createMcpServer();
      const res = await handleHttpRpc(server, req);
      return new Response(res.body, { status: res.status, headers: { ...Object.fromEntries(res.headers), ...corsHeaders(origin, cors) } });
    }
    if (req.method === "GET") {
      if (currentCfg.features?.enableMcpSse === false) {
        return new Response("MCP SSE disabled", { status: 403, headers: corsHeaders(origin, cors) });
      }
      const server = await createMcpServer();
      const { handleOpen } = createSseEndpoints(server);
      const res = await handleOpen(req);
      return new Response(res.body, { status: res.status, headers: { ...Object.fromEntries(res.headers), ...corsHeaders(origin, cors) } });
    }
  }

  if (url.pathname === "/mcp/sse") {
    if (currentCfg.features?.enableMcpSse === false) {
      return new Response("MCP SSE disabled", { status: 403, headers: corsHeaders(origin, cors) });
    }
    const server = await createMcpServer();
    const { handleOpen } = createSseEndpoints(server);
    const res = await handleOpen(req);
    return new Response(res.body, { status: res.status, headers: { ...Object.fromEntries(res.headers), ...corsHeaders(origin, cors) } });
  }

  if (url.pathname === "/mcp/message") {
    if (req.method === "POST") {
      if (currentCfg.features?.enableMcpSse === false) {
        return new Response("MCP SSE disabled", { status: 403, headers: corsHeaders(origin, cors) });
      }
      const server = await createMcpServer();
      const { handleMessage } = createSseEndpoints(server);
      const res = await handleMessage(req);
      return new Response(await res.text(), { status: res.status, headers: { ...Object.fromEntries(res.headers), ...corsHeaders(origin, cors) } });
    }
  }

  if (url.pathname === "/api/health") {
    return new Response(JSON.stringify({ ok: true, ts: Date.now() }), { headers: { "Content-Type": "application/json", ...corsHeaders(origin, cors) } });
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

  if (url.pathname.startsWith("/api/") && currentCfg.features?.enableHttpAdmin === false) {
    return new Response("Admin API disabled", { status: 403, headers: corsHeaders(origin, cors) });
  }

  if (url.pathname === "/api/logs/sse") {
    const controller = new AbortController();
    req.signal.addEventListener("abort", () => controller.abort());
    return createLogStream(controller.signal);
  }
  if (url.pathname === "/api/logs/snapshot") {
    return new Response(JSON.stringify(getSnapshot(), null, 2), { headers: { "Content-Type": "application/json", ...corsHeaders(origin, cors) } });
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

Deno.addSignalListener?.("SIGINT", () => { try { disposePlugins(); } catch (_) { /* ignore */ } Deno.exit(); });
Deno.addSignalListener?.("SIGTERM", () => { try { disposePlugins(); } catch (_) { /* ignore */ } Deno.exit(); });

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
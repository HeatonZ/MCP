import type { AppConfig } from "@shared/types/system.ts";

export function applyEnvOverrides(cfg: AppConfig): AppConfig {
	const out: AppConfig = JSON.parse(JSON.stringify(cfg));
	const port = Deno.env.get("MCP_HTTP_PORT");
	if (port) out.httpPort = Number(port);
	const allowedDirs = Deno.env.get("MCP_ALLOWED_DIRS");
	if (allowedDirs) {
		out.security = out.security ?? { allowedDirs: [], http: { allowedHosts: [], timeoutMs: 15000, maxResponseBytes: 1000000 } };
		out.security.allowedDirs = splitList(allowedDirs);
	}
	const allowedHosts = Deno.env.get("MCP_HTTP_ALLOWED_HOSTS");
	const timeoutMs = Deno.env.get("MCP_HTTP_TIMEOUT_MS");
	const maxBytes = Deno.env.get("MCP_HTTP_MAX_BYTES");
	if (allowedHosts || timeoutMs || maxBytes) {
		out.security = out.security ?? { allowedDirs: ["server", "config"], http: { allowedHosts: [], timeoutMs: 15000, maxResponseBytes: 1000000 } };
		out.security.http.allowedHosts = allowedHosts ? splitList(allowedHosts) : out.security.http.allowedHosts;
		out.security.http.timeoutMs = timeoutMs ? Number(timeoutMs) : out.security.http.timeoutMs;
		out.security.http.maxResponseBytes = maxBytes ? Number(maxBytes) : out.security.http.maxResponseBytes;
	}
	const cors = Deno.env.get("MCP_CORS_ORIGINS");
    if (cors) out.cors = { ...(out.cors ?? {}), allowedOrigins: splitList(cors) } as AppConfig["cors"];
	const maxLogs = Deno.env.get("MCP_MAX_LOGS");
	if (maxLogs) out.logging = { ...(out.logging ?? {}), maxLogs: Number(maxLogs) };

	// 传输开关（可选）
	const sse = Deno.env.get("MCP_ENABLE_SSE");
	if (sse != null) out.features.enableMcpSse = sse === "1" || sse.toLowerCase() === "true";
	const http = Deno.env.get("MCP_ENABLE_HTTP");
	if (http != null) out.features.enableMcpHttp = http === "1" || http.toLowerCase() === "true";
	return out;
}

function splitList(v: string): string[] { return v.split(",").map(s => s.trim()).filter(Boolean); } 
import type { AppConfig } from "@shared/types/system.ts";
import { DEFAULT_HTTP_PORT, DEFAULT_ALLOWED_DIRS, DEFAULT_CORS_ORIGINS, TIMEOUTS, INTERVALS, RECONNECT, LIMITS } from "@server/constants.ts";

// 从 version.json 读取版本号
const VERSION = await (async () => {
	try {
		const versionFile = await Deno.readTextFile("./version.json");
		const versionData = JSON.parse(versionFile);
		return versionData.version;
	} catch {
		return "0.1.0"; // 后备版本
	}
})();

export const defaultConfig: AppConfig = {
	serverName: "deno-mcp",
	version: VERSION,
	httpPort: DEFAULT_HTTP_PORT,
	features: {
		enableHttpAdmin: true,
		enableCodeEditing: true,
		enableMcpSse: true,
		enableMcpHttp: true,
	},
	security: {
		allowedDirs: DEFAULT_ALLOWED_DIRS,
		http: {
			allowedHosts: [],
			timeoutMs: TIMEOUTS.HTTP_REQUEST,
			maxResponseBytes: LIMITS.MAX_RESPONSE_BYTES,
		},
	},
	// MCP连接管理配置
	mcp: {
		heartbeat: {
			intervalMs: TIMEOUTS.HEARTBEAT_INTERVAL,
			timeoutMs: TIMEOUTS.HEARTBEAT_TIMEOUT,
		},
		session: {
			maxIdleMs: TIMEOUTS.SESSION_IDLE,
			cleanupIntervalMs: INTERVALS.CLEANUP,
		},
		reconnect: {
			enabled: true,
			maxAttempts: RECONNECT.MAX_RETRIES,
			baseDelayMs: RECONNECT.INITIAL_DELAY,
			maxDelayMs: RECONNECT.MAX_DELAY,
		},
	},
	cors: {
		allowedOrigins: DEFAULT_CORS_ORIGINS
	},
	logging: {
		maxLogs: LIMITS.MAX_LOGS,
		// 启用MCP连接相关的详细日志
		verboseMcp: false,
	},
	upstreams: [],
}; 
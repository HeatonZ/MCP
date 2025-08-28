import type { AppConfig } from "@shared/types/system.ts";

export const defaultConfig: AppConfig = {
	serverName: "deno-mcp",
	version: "0.0.0",
	httpPort: 8787,
	features: {
		enableHttpAdmin: true,
		enableCodeEditing: true,
		enableMcpSse: true,
		enableMcpHttp: true,
	},
	security: {
		allowedDirs: ["server", "config"],
		http: {
			allowedHosts: [],
			timeoutMs: 15000,
			maxResponseBytes: 1000000,
		},
	},
	// MCP连接管理配置
	mcp: {
		heartbeat: {
			intervalMs: 10000, // 心跳间隔10秒
			timeoutMs: 30000,  // 心跳超时30秒
		},
		session: {
			maxIdleMs: 30 * 60 * 1000, // 会话最大空闲时间30分钟
			cleanupIntervalMs: 2 * 60 * 1000, // 清理间隔2分钟
		},
		reconnect: {
			enabled: true,
			maxAttempts: 5,
			baseDelayMs: 1000,
			maxDelayMs: 30000,
		},
	},
	cors: {
		allowedOrigins: ["*"]
	},
	logging: {
		maxLogs: 1000,
		// 启用MCP连接相关的详细日志
		verboseMcp: false,
	},
	upstreams: [],
}; 
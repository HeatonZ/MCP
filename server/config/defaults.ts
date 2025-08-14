import type { AppConfig } from "@shared/types/system.ts";

export const defaultConfig: AppConfig = {
	serverName: "deno-mcp",
	version: "0.0.0",
	httpPort: 8787,
	features: {
		enableHttpAdmin: true,
		enableCodeEditing: true,
	},
	security: {
		allowedDirs: ["server", "config"],
		http: {
			allowedHosts: [],
			timeoutMs: 15000,
			maxResponseBytes: 1000000,
		},
	},
	cors: {
		allowedOrigins: ["*"]
	},
	logging: {
		maxLogs: 1000,
	},
}; 
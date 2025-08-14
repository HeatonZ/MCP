export type AppConfig = {
	serverName: string;
	version: string;
	httpPort: number;
	features: {
		enableHttpAdmin: boolean;
		enableCodeEditing: boolean;
		/** 是否启用 MCP 的 SSE 传输端点 */
		enableMcpSse?: boolean;
		/** 是否启用 MCP 的纯 HTTP（一次性）传输端点 */
		enableMcpHttp?: boolean;
	};
	/**
	 * 上游 MCP 服务配置列表
	 */
	upstreams?: Array<UpstreamConfig>;
	security?: {
		allowedDirs: string[];
		http: {
			allowedHosts: string[];
			timeoutMs: number;
			maxResponseBytes: number;
		};
	};
	cors?: {
		allowedOrigins: string[];
	};
	logging?: {
		maxLogs: number;
	};
};

export type UpstreamTransport = "stdio" | "http" | "sse" | "ws";

export type UpstreamAuthConfig =
	| { type: "bearer"; token: string }
	| { type: "basic"; username: string; password: string }
	| { type: "header"; headerName: string; value: string }
	| { type: "mtls"; certPath: string; keyPath?: string };

export type UpstreamMappingConfig = {
	/** 是否隐藏命名空间前缀（例如将 namespace/tool 暴露为 tool） */
	hideNamespacePrefix?: boolean;
	/** 重命名映射：上游名称 -> 本地名称 */
	rename?: {
		tools?: Record<string, string>;
		resources?: Record<string, string>;
		prompts?: Record<string, string>;
	};
	/** 名称冲突策略：报错或后注册覆盖先前 */
	conflictPolicy?: "error" | "last-wins";
};

export type UpstreamCapabilities = {
	bridgeTools?: boolean;
	bridgeResources?: boolean;
	bridgePrompts?: boolean;
	bridgeModels?: boolean;
	bridgeSessions?: boolean;
};

export type UpstreamRuntimeLimits = {
	timeouts?: { connectMs?: number; callMs?: number };
	concurrency?: { maxConcurrentCalls?: number; queueSize?: number };
};

export type UpstreamReconnectPolicy = {
	enabled?: boolean;
	initialDelayMs?: number;
	maxDelayMs?: number;
	factor?: number;
	maxRetries?: number | "infinite";
	heartbeatMs?: number;
};

export type UpstreamWhitelist = {
	allowedHosts?: string[];
};

export type UpstreamConfigBase = {
	/** 唯一名称 */
	name: string;
	/** 是否启用 */
	enabled?: boolean;
	/** 注册到本地时的命名空间前缀；默认使用 name */
	namespace?: string;
	/** 重命名/隐藏策略 */
	mapping?: UpstreamMappingConfig;
	/** 能力开关 */
	capabilities?: UpstreamCapabilities;
	/** 白名单覆盖（仅 http/ws/sse 有效；不配置则沿用全局） */
	whitelist?: UpstreamWhitelist;
	/** 并发/超时限制 */
	limits?: UpstreamRuntimeLimits;
	/** 断线重连策略（针对长连类传输） */
	reconnect?: UpstreamReconnectPolicy;
};

export type UpstreamConfigStdio = UpstreamConfigBase & {
	transport: "stdio";
	command: string;
	args?: string[];
	cwd?: string;
	env?: Record<string, string>;
};

export type UpstreamConfigHttpBase = UpstreamConfigBase & {
	url: string;
	headers?: Record<string, string>;
	auth?: UpstreamAuthConfig;
};

export type UpstreamConfigHttp = UpstreamConfigHttpBase & { transport: "http" };
export type UpstreamConfigSse = UpstreamConfigHttpBase & { transport: "sse" };
export type UpstreamConfigWs = UpstreamConfigHttpBase & { transport: "ws" };

export type UpstreamConfig =
	| UpstreamConfigStdio
	| UpstreamConfigHttp
	| UpstreamConfigSse
	| UpstreamConfigWs;
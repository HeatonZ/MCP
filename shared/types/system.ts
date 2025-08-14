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
	upstreams?: Array<{
		/** 唯一名称 */
		name: string;
		/** 传输类型，目前支持 stdio */
		transport: "stdio";
		/** 可执行命令 */
		command: string;
		/** 命令参数 */
		args?: string[];
		/** 工作目录 */
		cwd?: string;
		/** 环境变量 */
		env?: Record<string, string>;
		/** 注册到本地时的命名空间前缀；默认使用 name */
		namespace?: string;
		/** 是否启用 */
		enabled?: boolean;
	}>;
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
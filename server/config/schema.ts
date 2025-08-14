import { z } from "npm:zod";

export const AppConfigSchema = z.object({
	serverName: z.string().min(1),
	version: z.string().min(1),
	httpPort: z.number().int().positive(),
	features: z.object({
		enableHttpAdmin: z.boolean(),
		enableCodeEditing: z.boolean(),
		enableMcpSse: z.boolean().optional(),
		enableMcpHttp: z.boolean().optional(),
	}),
	upstreams: z.array(
		z.discriminatedUnion("transport", [
			z.object({
				transport: z.literal("stdio"),
				name: z.string().min(1),
				enabled: z.boolean().optional(),
				namespace: z.string().optional(),
				mapping: z.object({
					hideNamespacePrefix: z.boolean().optional(),
					rename: z.object({
						tools: z.record(z.string()).optional(),
						resources: z.record(z.string()).optional(),
						prompts: z.record(z.string()).optional(),
					}).optional(),
					conflictPolicy: z.enum(["error", "last-wins"]).optional(),
				}).optional(),
				capabilities: z.object({
					bridgeTools: z.boolean().optional(),
					bridgeResources: z.boolean().optional(),
					bridgePrompts: z.boolean().optional(),
					bridgeModels: z.boolean().optional(),
					bridgeSessions: z.boolean().optional(),
				}).optional(),
				limits: z.object({
					timeouts: z.object({ connectMs: z.number().int().positive().optional(), callMs: z.number().int().positive().optional() }).optional(),
					concurrency: z.object({ maxConcurrentCalls: z.number().int().positive().optional(), queueSize: z.number().int().nonnegative().optional() }).optional(),
				}).optional(),
				reconnect: z.object({
					enabled: z.boolean().optional(),
					initialDelayMs: z.number().int().positive().optional(),
					maxDelayMs: z.number().int().positive().optional(),
					factor: z.number().positive().optional(),
					maxRetries: z.union([z.number().int().nonnegative(), z.literal("infinite")]).optional(),
					heartbeatMs: z.number().int().positive().optional(),
				}).optional(),
				command: z.string().min(1),
				args: z.array(z.string()).optional(),
				cwd: z.string().optional(),
				env: z.record(z.string()).optional(),
			}),
			z.object({
				transport: z.literal("http"),
				name: z.string().min(1),
				enabled: z.boolean().optional(),
				namespace: z.string().optional(),
				mapping: z.object({
					hideNamespacePrefix: z.boolean().optional(),
					rename: z.object({
						tools: z.record(z.string()).optional(),
						resources: z.record(z.string()).optional(),
						prompts: z.record(z.string()).optional(),
					}).optional(),
					conflictPolicy: z.enum(["error", "last-wins"]).optional(),
				}).optional(),
				capabilities: z.object({
					bridgeTools: z.boolean().optional(),
					bridgeResources: z.boolean().optional(),
					bridgePrompts: z.boolean().optional(),
					bridgeModels: z.boolean().optional(),
					bridgeSessions: z.boolean().optional(),
				}).optional(),
				limits: z.object({
					timeouts: z.object({ connectMs: z.number().int().positive().optional(), callMs: z.number().int().positive().optional() }).optional(),
					concurrency: z.object({ maxConcurrentCalls: z.number().int().positive().optional(), queueSize: z.number().int().nonnegative().optional() }).optional(),
				}).optional(),
				reconnect: z.object({
					enabled: z.boolean().optional(),
					initialDelayMs: z.number().int().positive().optional(),
					maxDelayMs: z.number().int().positive().optional(),
					factor: z.number().positive().optional(),
					maxRetries: z.union([z.number().int().nonnegative(), z.literal("infinite")]).optional(),
					heartbeatMs: z.number().int().positive().optional(),
				}).optional(),
				url: z.string().min(1),
				headers: z.record(z.string()).optional(),
				auth: z.union([
					z.object({ type: z.literal("bearer"), token: z.string().min(1) }),
					z.object({ type: z.literal("basic"), username: z.string().min(1), password: z.string().min(1) }),
					z.object({ type: z.literal("header"), headerName: z.string().min(1), value: z.string().min(1) }),
					z.object({ type: z.literal("mtls"), certPath: z.string().min(1), keyPath: z.string().optional() }),
				]).optional(),
				whitelist: z.object({ allowedHosts: z.array(z.string()) }).optional(),
			}),
			z.object({
				transport: z.literal("sse"),
				name: z.string().min(1),
				enabled: z.boolean().optional(),
				namespace: z.string().optional(),
				mapping: z.object({
					hideNamespacePrefix: z.boolean().optional(),
					rename: z.object({
						tools: z.record(z.string()).optional(),
						resources: z.record(z.string()).optional(),
						prompts: z.record(z.string()).optional(),
					}).optional(),
					conflictPolicy: z.enum(["error", "last-wins"]).optional(),
				}).optional(),
				capabilities: z.object({
					bridgeTools: z.boolean().optional(),
					bridgeResources: z.boolean().optional(),
					bridgePrompts: z.boolean().optional(),
					bridgeModels: z.boolean().optional(),
					bridgeSessions: z.boolean().optional(),
				}).optional(),
				limits: z.object({
					timeouts: z.object({ connectMs: z.number().int().positive().optional(), callMs: z.number().int().positive().optional() }).optional(),
					concurrency: z.object({ maxConcurrentCalls: z.number().int().positive().optional(), queueSize: z.number().int().nonnegative().optional() }).optional(),
				}).optional(),
				reconnect: z.object({
					enabled: z.boolean().optional(),
					initialDelayMs: z.number().int().positive().optional(),
					maxDelayMs: z.number().int().positive().optional(),
					factor: z.number().positive().optional(),
					maxRetries: z.union([z.number().int().nonnegative(), z.literal("infinite")]).optional(),
					heartbeatMs: z.number().int().positive().optional(),
				}).optional(),
				url: z.string().min(1),
				headers: z.record(z.string()).optional(),
				auth: z.union([
					z.object({ type: z.literal("bearer"), token: z.string().min(1) }),
					z.object({ type: z.literal("basic"), username: z.string().min(1), password: z.string().min(1) }),
					z.object({ type: z.literal("header"), headerName: z.string().min(1), value: z.string().min(1) }),
					z.object({ type: z.literal("mtls"), certPath: z.string().min(1), keyPath: z.string().optional() }),
				]).optional(),
				whitelist: z.object({ allowedHosts: z.array(z.string()) }).optional(),
			}),
			z.object({
				transport: z.literal("ws"),
				name: z.string().min(1),
				enabled: z.boolean().optional(),
				namespace: z.string().optional(),
				mapping: z.object({
					hideNamespacePrefix: z.boolean().optional(),
					rename: z.object({
						tools: z.record(z.string()).optional(),
						resources: z.record(z.string()).optional(),
						prompts: z.record(z.string()).optional(),
					}).optional(),
					conflictPolicy: z.enum(["error", "last-wins"]).optional(),
				}).optional(),
				capabilities: z.object({
					bridgeTools: z.boolean().optional(),
					bridgeResources: z.boolean().optional(),
					bridgePrompts: z.boolean().optional(),
					bridgeModels: z.boolean().optional(),
					bridgeSessions: z.boolean().optional(),
				}).optional(),
				limits: z.object({
					timeouts: z.object({ connectMs: z.number().int().positive().optional(), callMs: z.number().int().positive().optional() }).optional(),
					concurrency: z.object({ maxConcurrentCalls: z.number().int().positive().optional(), queueSize: z.number().int().nonnegative().optional() }).optional(),
				}).optional(),
				reconnect: z.object({
					enabled: z.boolean().optional(),
					initialDelayMs: z.number().int().positive().optional(),
					maxDelayMs: z.number().int().positive().optional(),
					factor: z.number().positive().optional(),
					maxRetries: z.union([z.number().int().nonnegative(), z.literal("infinite")]).optional(),
					heartbeatMs: z.number().int().positive().optional(),
				}).optional(),
				url: z.string().min(1),
				headers: z.record(z.string()).optional(),
				auth: z.union([
					z.object({ type: z.literal("bearer"), token: z.string().min(1) }),
					z.object({ type: z.literal("basic"), username: z.string().min(1), password: z.string().min(1) }),
					z.object({ type: z.literal("header"), headerName: z.string().min(1), value: z.string().min(1) }),
					z.object({ type: z.literal("mtls"), certPath: z.string().min(1), keyPath: z.string().optional() }),
				]).optional(),
				whitelist: z.object({ allowedHosts: z.array(z.string()) }).optional(),
			}),
		])
	).optional(),
	security: z.object({
		allowedDirs: z.array(z.string()).nonempty(),
		http: z.object({
			allowedHosts: z.array(z.string()),
			timeoutMs: z.number().int().positive(),
			maxResponseBytes: z.number().int().positive(),
		}),
	}).optional(),
	cors: z.object({
		allowedOrigins: z.array(z.string()).nonempty(),
	}).optional(),
	logging: z.object({
		maxLogs: z.number().int().positive(),
	}).optional(),
});

export type AppConfigInput = z.infer<typeof AppConfigSchema>; 
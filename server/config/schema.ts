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
  upstreams: z.array(z.object({
    name: z.string().min(1),
    transport: z.literal("stdio"),
    command: z.string().min(1),
    args: z.array(z.string()).optional(),
    cwd: z.string().optional(),
    env: z.record(z.string()).optional(),
    namespace: z.string().optional(),
    enabled: z.boolean().optional(),
  })).optional(),
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
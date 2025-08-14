import { z } from "npm:zod";
import type { ToolSpec } from "@shared/types/tool.ts";
import { configProvider } from "../config_access.ts";

async function ensureConfig() {
	return configProvider.getConfigSync() ?? await configProvider.loadConfig();
}

export const coreTools: ToolSpec[] = [
	{
		name: "add",
		title: "加法",
		description: "两个数字相加",
		inputSchema: { a: "number", b: "number" },
		zodSchema: { a: z.number(), b: z.number() },
		handler: async ({ a, b }) => {
			const x = Number(a);
			const y = Number(b);
			return { text: String(x + y) };
		}
	},
	{
		name: "get_config",
		title: "读取配置",
		description: "返回当前配置",
		inputSchema: {},
		handler: async () => {
			const cfg = await ensureConfig();
			return { text: JSON.stringify(cfg) };
		}
	},
	{
		name: "set_server_name",
		title: "设置服务名",
		description: "更新配置 serverName",
		inputSchema: { name: "string" },
		zodSchema: { name: z.string() },
		handler: async ({ name }) => {
			const cfg = await ensureConfig();
			cfg.serverName = String(name ?? "");
			await configProvider.saveConfig(cfg);
			return { text: `serverName -> ${cfg.serverName}` };
		}
	},
]; 
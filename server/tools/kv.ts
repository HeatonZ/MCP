/// <reference lib="deno.unstable" />
import { z } from "npm:zod";
import type { ToolSpec } from "@shared/types/tool.ts";
import { kvGet, kvList, kvSet } from "../kv.ts";

export const kvTools: ToolSpec[] = [
	{
		name: "kv_set",
		title: "KV 设置",
		description: "写入键值",
		inputSchema: { key: "string", value: "json" },
		zodSchema: { key: z.string(), value: z.any() },
		handler: async ({ key, value }) => {
			await kvSet(String(key), value);
			return { text: "ok" };
		}
	},
	{
		name: "kv_get",
		title: "KV 读取",
		description: "读取键值",
		inputSchema: { key: "string" },
		zodSchema: { key: z.string() },
		handler: async ({ key }) => {
			const v = await kvGet(String(key));
			return { text: JSON.stringify(v) };
		}
	},
	{
		name: "kv_list_prefix",
		title: "KV 前缀列表",
		description: "列出指定前缀的键",
		inputSchema: { prefix: "string" },
		zodSchema: { prefix: z.string() },
		handler: async ({ prefix }) => {
			const v = await kvList(String(prefix));
			return { text: JSON.stringify(v) };
		}
	},
]; 
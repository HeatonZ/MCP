import { z } from "npm:zod";
import type { ToolSpec } from "@shared/types/tool.ts";
import { getConfigSync, loadConfig } from "@server/config.ts";
import { safeResolve } from "@server/security/paths.ts";

async function ensureConfig() {
	return getConfigSync() ?? await loadConfig();
}

export const fsTools: ToolSpec[] = [
	{
		name: "file_read",
		title: "读取文件",
		description: "读取允许目录内的文件内容",
		inputSchema: { path: "string" },
		zodSchema: { path: z.string() },
		handler: async ({ path }) => {
			const cfg = await ensureConfig();
			const allowedDirs = cfg.security?.allowedDirs ?? ["server", "config"];
			const resolved = safeResolve(String(path), allowedDirs);
			if (!resolved.ok) return { text: resolved.message, isError: true };
			try {
				const text = await Deno.readTextFile(resolved.path);
				return { text };
			} catch (e) {
				return { text: String(e), isError: true };
			}
		}
	},
	{
		name: "file_write",
		title: "写入文件",
		description: "写入允许目录内的文件内容",
		inputSchema: { path: "string", content: "string" },
		zodSchema: { path: z.string(), content: z.string() },
		handler: async ({ path, content }) => {
			const cfg = await ensureConfig();
			const allowedDirs = cfg.security?.allowedDirs ?? ["server", "config"];
			const resolved = safeResolve(String(path), allowedDirs);
			if (!resolved.ok) return { text: resolved.message, isError: true };
			try {
				await Deno.writeTextFile(resolved.path, String(content ?? ""));
				return { text: "ok" };
			} catch (e) {
				return { text: String(e), isError: true };
			}
		}
	},
	{
		name: "file_list",
		title: "列出文件",
		description: "列出目录下文件（非递归）",
		inputSchema: { dir: "string" },
		zodSchema: { dir: z.string() },
		handler: async ({ dir }) => {
			const cfg = await ensureConfig();
			const allowedDirs = cfg.security?.allowedDirs ?? ["server", "config"];
			const d = String(dir ?? ".");
			const resolved = safeResolve(d, allowedDirs);
			if (!resolved.ok) return { text: resolved.message, isError: true };
			const arr: string[] = [];
			for await (const e of Deno.readDir(resolved.path)) {
				arr.push(`${d}/${e.name}`.replaceAll("\\", "/"));
			}
			return { text: JSON.stringify(arr) };
		}
	},
]; 
import { z } from "npm:zod";
import type { ToolSpec } from "@shared/types/tool.ts";
import { getConfigSync, loadConfig } from "@server/config.ts";
import { isHostAllowed, fetchWithLimit } from "@server/security/http.ts";
import { logError, logInfo, logWarn } from "@server/logger.ts";

async function ensureConfig() {
	return getConfigSync() ?? await loadConfig();
}

export const httpTools: ToolSpec[] = [
	{
		name: "http_get",
		title: "HTTP GET",
		description: "发起 HTTP GET 请求并返回文本（受白名单/超时/大小限制）",
		inputSchema: { url: "string" },
		zodSchema: { url: z.string().url() },
		handler: async ({ url }) => {
			const u = String(url ?? "");
			const cfg = await ensureConfig();
			const sec = cfg.security ?? { allowedDirs: ["server","config"], http: { allowedHosts: [], timeoutMs: 15000, maxResponseBytes: 1000000 } };
			if (!isHostAllowed(u, sec.http.allowedHosts)) {
				logWarn("tool.http_get", "host not allowed", { url: u } as any);
				return { text: "host not allowed", isError: true };
			}
			const r = await fetchWithLimit(u, { timeoutMs: sec.http.timeoutMs, maxBytes: sec.http.maxResponseBytes });
			if (!r.ok) {
				logError("tool.http_get", "fetch error", { url: u, error: r.error } as any);
				return { text: r.error, isError: true };
			}
			logInfo("tool.http_get", "success", { url: u } as any);
			return { text: r.text };
		}
	},
]; 
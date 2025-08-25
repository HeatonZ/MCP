import { z } from "npm:zod";
import type { ToolSpec } from "@shared/types/tool.ts";
import { getConfigSync, loadConfig } from "@server/config.ts";
import { isHostAllowed, fetchWithLimit } from "@server/security/http.ts";
import { logError, logInfo, logWarn } from "@server/logger.ts";

async function ensureConfig() {
	return getConfigSync() ?? await loadConfig();
}

export const httpTools: ToolSpec[] = []; 
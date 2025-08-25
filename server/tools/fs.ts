import { z } from "npm:zod";
import type { ToolSpec } from "@shared/types/tool.ts";
import { getConfigSync, loadConfig } from "@server/config.ts";
import { safeResolve } from "@server/security/paths.ts";

async function ensureConfig() {
	return getConfigSync() ?? await loadConfig();
}

export const fsTools: ToolSpec[] = []; 
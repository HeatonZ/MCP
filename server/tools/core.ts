import { z } from "npm:zod";
import type { ToolSpec } from "@shared/types/tool.ts";
import { configProvider } from "../config_access.ts";

async function ensureConfig() {
	return configProvider.getConfigSync() ?? await configProvider.loadConfig();
}

export const coreTools: ToolSpec[] = []; 
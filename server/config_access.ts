import { getConfigSync, loadConfig, saveConfig } from "@server/config.ts";
import type { AppConfig } from "@shared/types/system.ts";

export type ConfigProvider = {
	getConfigSync: () => AppConfig | null;
	loadConfig: () => Promise<AppConfig>;
	saveConfig: (cfg: AppConfig) => Promise<void>;
};

export const configProvider: ConfigProvider = {
	getConfigSync,
	loadConfig,
	saveConfig,
}; 
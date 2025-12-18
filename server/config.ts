import type { AppConfig } from "@shared/types/system.ts";
import { defaultConfig } from "@server/config/defaults.ts";
import { AppConfigSchema } from "@server/config/schema.ts";
import { applyEnvOverrides } from "@server/config/env.ts";
import { fromFileUrl } from "@std/path";

const CONFIG_PATH = new URL("../config/config.json", import.meta.url);
const LOCAL_OVERRIDE_PATH = new URL("../config/config.local.json", import.meta.url);
const CONFIG_DIR_PATH = fromFileUrl(new URL("../config", import.meta.url));

let cachedConfig: AppConfig | null = null;
const subscribers = new Set<(cfg: AppConfig) => void>();

async function readConfigFile(): Promise<Partial<AppConfig>> {
	try {
		const text = await Deno.readTextFile(CONFIG_PATH);
		return JSON.parse(text) as Partial<AppConfig>;
	} catch {
		return {} as Partial<AppConfig>;
	}
}

async function readLocalOverride(): Promise<Partial<AppConfig>> {
    try {
        if(Deno.env.has('CONFIG')){
            return JSON.parse(Deno.env.get('CONFIG')!) as Partial<AppConfig>;
        }
        const text = await Deno.readTextFile(LOCAL_OVERRIDE_PATH);
        return JSON.parse(text) as Partial<AppConfig>;
    } catch {
        return {} as Partial<AppConfig>;
    }
}

function mergeConfig(base: AppConfig, over: Partial<AppConfig>): AppConfig {
	const features = { ...base.features, ...(over.features ?? {}) };
  const secBase = base.security ?? defaultConfig.security!;
  const httpBase = secBase.http;
  const secOver: NonNullable<AppConfig["security"]> = (over.security ?? {
    allowedDirs: secBase.allowedDirs,
    http: httpBase,
  });
  const httpOver: NonNullable<AppConfig["security"]>["http"] = secOver.http ?? httpBase;
	const security = {
    allowedDirs: secOver.allowedDirs ?? secBase.allowedDirs,
		http: {
      allowedHosts: httpOver.allowedHosts ?? httpBase.allowedHosts,
      timeoutMs: httpOver.timeoutMs ?? httpBase.timeoutMs,
      maxResponseBytes: httpOver.maxResponseBytes ?? httpBase.maxResponseBytes,
		},
	};
	const cors = {
		allowedOrigins: over.cors?.allowedOrigins ?? base.cors?.allowedOrigins ?? defaultConfig.cors!.allowedOrigins,
	};
	const logging = {
		maxLogs: over.logging?.maxLogs ?? base.logging?.maxLogs ?? defaultConfig.logging!.maxLogs,
	};
	return {
		serverName: over.serverName ?? base.serverName,
		version: over.version ?? base.version,
		httpPort: over.httpPort ?? base.httpPort,
		features,
		security,
		cors,
		logging,
		// 保留上游配置（若覆盖层未提供则使用基础层）
		upstreams: over.upstreams ?? (base as AppConfig).upstreams,
	};
}

export async function loadConfig(): Promise<AppConfig> {
    const fileCfg = await readConfigFile();
    const localCfg = await readLocalOverride();
    const mergedFile = mergeConfig(defaultConfig, fileCfg);
    const merged = mergeConfig(mergedFile, localCfg);
	const withEnv = applyEnvOverrides(merged);
	const parsed = AppConfigSchema.safeParse(withEnv);
	if (!parsed.success) {
		throw new Error("Invalid configuration: " + parsed.error.message);
	}
	cachedConfig = parsed.data as AppConfig;
	return cachedConfig;
}

export function getConfigSync(): AppConfig | null {
	return cachedConfig;
}

export async function saveConfig(cfg: AppConfig): Promise<void> {
	const parsed = AppConfigSchema.safeParse(cfg);
	if (!parsed.success) {
		throw new Error("Invalid configuration: " + parsed.error.message);
	}
	
	// 保存旧配置用于比较
	const oldConfig = cachedConfig;
	
	const pretty = JSON.stringify(parsed.data, null, 2);
	await Deno.writeTextFile(CONFIG_PATH, pretty);
	cachedConfig = parsed.data as AppConfig;
	
	// 检查上游配置是否有变化，如果有则重启相关服务
	if (oldConfig) {
		await handleUpstreamConfigChanges(oldConfig, cachedConfig);
	}
	
	for (const fn of subscribers) fn(cachedConfig);
}

async function handleUpstreamConfigChanges(oldConfig: AppConfig, newConfig: AppConfig): Promise<void> {
	const { reconnectUpstream } = await import("@server/upstream/index.ts");
	const { logInfo } = await import("@server/logger.ts");
	
	const oldUpstreams = oldConfig.upstreams || [];
	const newUpstreams = newConfig.upstreams || [];
	
	// 创建映射以便比较
	const oldUpstreamMap = new Map(oldUpstreams.map(u => [u.name, u]));
	const newUpstreamMap = new Map(newUpstreams.map(u => [u.name, u]));
	
	// 检查需要重启的上游服务
	const upstreamsToRestart = new Set<string>();
	
	// 检查修改的上游
	for (const [name, newUpstream] of newUpstreamMap) {
		const oldUpstream = oldUpstreamMap.get(name);
		if (oldUpstream) {
			// 比较关键配置是否有变化
			if (hasUpstreamConfigChanged(oldUpstream, newUpstream)) {
				upstreamsToRestart.add(name);
			}
		}
	}
	
	// 检查新增的上游（需要初始化）
	for (const [name] of newUpstreamMap) {
		if (!oldUpstreamMap.has(name)) {
			upstreamsToRestart.add(name);
		}
	}
	
	// 重启需要更新的上游服务
	for (const name of upstreamsToRestart) {
		try {
			logInfo("config", `重启上游服务: ${name}`);
			await reconnectUpstream(name);
		} catch (error) {
			logInfo("config", `重启上游服务失败: ${name}`, { error: String(error) });
		}
	}
}

function hasUpstreamConfigChanged(old: Record<string, unknown>, new_: Record<string, unknown>): boolean {
	// 比较关键配置字段
	const keyFields = ['transport', 'url', 'command', 'args', 'cwd', 'env', 'headers', 'enabled', 'namespace'];
	
	for (const field of keyFields) {
		if (JSON.stringify(old[field]) !== JSON.stringify(new_[field])) {
			return true;
		}
	}
	
	return false;
}

export function onConfigChange(cb: (cfg: AppConfig) => void): () => void {
	subscribers.add(cb);
	return () => subscribers.delete(cb);
} 

export async function reloadConfig(): Promise<AppConfig> {
    // 重新读取并合并配置，然后通知订阅者
    const fileCfg = await readConfigFile();
    const localCfg = await readLocalOverride();
    const mergedFile = mergeConfig(defaultConfig, fileCfg);
    const merged = mergeConfig(mergedFile, localCfg);
    const withEnv = applyEnvOverrides(merged);
    const parsed = AppConfigSchema.safeParse(withEnv);
    if (!parsed.success) throw new Error("Invalid configuration: " + parsed.error.message);
    cachedConfig = parsed.data as AppConfig;
    for (const fn of subscribers) fn(cachedConfig);
    return cachedConfig;
}

export function startConfigWatcher(): AbortController {
    const controller = new AbortController();
    let timer: number | null = null;
    const trigger = () => {
        if (timer != null) return;
        // debounce ~200ms
        timer = setTimeout(async () => {
            timer = null;
            try { await reloadConfig(); } catch (_) { /* ignore invalid edits */ }
        }, 200) as unknown as number;
    };
    (async () => {
        try {
            // Deno.watchFs options do not support AbortSignal in stable; stop by closing when aborted
            const watcher = Deno.watchFs(CONFIG_DIR_PATH, { recursive: true });
            controller.signal.addEventListener("abort", () => {
                try { (watcher as unknown as { close: () => void }).close(); } catch (_) { /* watcher already closed */ }
            });
            for await (const ev of watcher) {
                if (!Array.isArray(ev.paths)) continue;
                for (const p of ev.paths) {
                    if (p.endsWith("config.json") || p.endsWith("config.local.json")) {
                        trigger();
                        break;
                    }
                }
            }
        } catch (_) { /* watcher closed */ }
    })();
    return controller;
}
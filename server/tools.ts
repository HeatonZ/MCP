import type { ToolSpec } from "@shared/types/tool.ts";
import { coreTools } from "./tools/core.ts";
import { fsTools } from "./tools/fs.ts";
import { httpTools } from "./tools/http.ts";
import { kvTools } from "./tools/kv.ts";
import { PluginManager } from "./core/plugin/manager.ts";
import { initUpstreams, listUpstreamToolsAsPlugin } from "./upstream/index.ts";

const pluginManager = new PluginManager();

// 兼容现有内置工具作为一个内置插件注册
pluginManager.register({
	name: "builtin-tools",
	version: "1.0.0",
	getTools: () => ([
		...coreTools,
		...fsTools,
		...httpTools,
		...kvTools,
	]),
});

export async function getAllTools(): Promise<ToolSpec[]> {
	return await pluginManager.getAllTools();
}

export async function initPlugins() {
    await pluginManager.initAll();
    // 初始化上游连接
    await initUpstreams();
    // 初始化上游并把上游工具注册为动态插件
    const upstreamPlugin = await listUpstreamToolsAsPlugin();
    if (upstreamPlugin) pluginManager.registerDynamic(upstreamPlugin);
}

export async function disposePlugins() {
	await pluginManager.disposeAll();
}
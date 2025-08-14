import type { ToolSpec } from "@shared/types/tool.ts";

export type PluginLifecycle = {
	name: string;
	version?: string;
	init?: () => Promise<void> | void;
	dispose?: () => Promise<void> | void;
};

export type ToolPlugin = PluginLifecycle & {
	getTools: () => ToolSpec[] | Promise<ToolSpec[]>;
};

export type PluginLoadResult = {
	plugins: ToolPlugin[];
};

export type UpstreamTool = ToolSpec & {
  /** 上游来源命名空间 */
  namespace: string;
};



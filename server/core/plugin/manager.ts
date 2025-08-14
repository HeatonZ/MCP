import type { ToolPlugin } from "./types.ts";

export class PluginManager {
	private readonly registered: ToolPlugin[] = [];
  // 供上游聚合工具动态注入
  private readonly dynamic: ToolPlugin[] = [];

	register(plugin: ToolPlugin): void {
		this.registered.push(plugin);
	}

  registerDynamic(plugin: ToolPlugin): void {
    this.dynamic.push(plugin);
  }

	async initAll(): Promise<void> {
		for (const p of this.registered) {
			await p.init?.();
		}
	}

	async disposeAll(): Promise<void> {
		for (const p of this.registered) {
			await p.dispose?.();
		}
	}

  async getAllTools() {
		const tools = [] as Awaited<ReturnType<ToolPlugin["getTools"]>> extends Array<infer T> ? T[] : never;
    for (const p of this.registered) {
			const t = await p.getTools();
			for (const it of t) tools.push(it);
		}
    for (const p of this.dynamic) {
      const t = await p.getTools();
      for (const it of t) tools.push(it);
    }
		return tools;
	}
}



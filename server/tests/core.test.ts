import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { coreTools } from "@server/tools/core.ts";
import { configProvider } from "@server/config_access.ts";
import type { AppConfig } from "@shared/types/system.ts";

Deno.test("core.add works", async () => {
  const add = coreTools.find(t => t.name === "add");
  if (!add) throw new Error("add tool missing");
  const r = await add.handler({ a: 2, b: 3 });
  assertEquals(r.text, "5");
});

Deno.test("core.get_config returns config json", async () => {
  const tool = coreTools.find(t => t.name === "get_config");
  if (!tool) throw new Error("get_config tool missing");
  const sample: AppConfig = { serverName: "x", version: "1", httpPort: 1234, features: { enableHttpAdmin: true, enableCodeEditing: false } } as any;
  const origGet = configProvider.getConfigSync;
  const origLoad = configProvider.loadConfig;
  (configProvider as any).getConfigSync = () => null;
  (configProvider as any).loadConfig = async () => sample;
  try {
    const r = await tool.handler({});
    const parsed = JSON.parse(r.text);
    assertEquals(parsed.serverName, "x");
    assertEquals(parsed.httpPort, 1234);
  } finally {
    (configProvider as any).getConfigSync = origGet;
    (configProvider as any).loadConfig = origLoad;
  }
});

Deno.test("core.set_server_name updates and saves", async () => {
  const tool = coreTools.find(t => t.name === "set_server_name");
  if (!tool) throw new Error("set_server_name tool missing");
  const cfg: AppConfig = { serverName: "old", version: "1", httpPort: 8787, features: { enableHttpAdmin: true, enableCodeEditing: true } } as any;
  const origGet = configProvider.getConfigSync;
  const origSave = configProvider.saveConfig;
  let saved: AppConfig | null = null as AppConfig | null;
  (configProvider as any).getConfigSync = () => cfg;
  (configProvider as any).saveConfig = async (next: AppConfig) => { saved = next; };
  try {
    const r = await tool.handler({ name: "newName" });
    assertEquals(r.text.includes("newName"), true);
    if (!saved) throw new Error("save not called");
    assertEquals(saved.serverName, "newName");
  } finally {
    (configProvider as any).getConfigSync = origGet;
    (configProvider as any).saveConfig = origSave;
  }
}); 
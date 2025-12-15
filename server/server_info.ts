import { getConfigSync } from "@server/config.ts";
import { getAllTools } from "@server/tools.ts";

/**
 * 获取服务器信息（包含实际的能力）
 */
export async function getServerInfo() {
  const cfg = getConfigSync();
  const tools = await getAllTools();
  
  return {
    name: cfg?.serverName ?? "deno-mcp-server",
    version: cfg?.version ?? "0.1.0"
  };
}

/**
 * 获取服务器能力信息
 */
export async function getServerCapabilities() {
  const tools = await getAllTools();
  
  return {
    tools: {},
    resources: {
      subscribe: false,
      listChanged: false
    },
    prompts: {
      listChanged: false
    },
    logging: {}
  };
}

/**
 * 获取完整的服务器状态（用于 info://server 资源）
 */
export async function getFullServerInfo() {
  const cfg = getConfigSync();
  const tools = await getAllTools();
  
  return {
    name: cfg?.serverName ?? "deno-mcp-server",
    version: cfg?.version ?? "0.1.0",
    uptime: Math.floor(Deno.osUptime()),
    capabilities: {
      tools: tools.length,
      resources: true,
      prompts: true,
      logging: true
    },
    toolsCount: tools.length,
    timestamp: new Date().toISOString()
  };
}


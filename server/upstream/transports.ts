import { Client } from "npm:@modelcontextprotocol/sdk@1.24.3/client/index.js";
import { StdioClientTransport } from "npm:@modelcontextprotocol/sdk@1.24.3/client/stdio.js";
import type { UpstreamConfig } from "@shared/types/system.ts";
import { getConfigSync, loadConfig } from "@server/config.ts";
import { DEFAULT_CLIENT_NAME_PREFIX } from "@server/constants.ts";

type StatusListener = (s: { connected: boolean; lastError?: string }) => void;

function _applyAuthHeaders(headers: Headers, cfg: UpstreamConfig & { url?: string }) {
    const h = headers;
    const anyCfg = cfg as unknown as { auth?: { type: string; token?: string; username?: string; password?: string; headerName?: string; value?: string } };
    const auth = anyCfg.auth;
    if (!auth) return;
    if (auth.type === "bearer" && auth.token) h.set("Authorization", `Bearer ${auth.token}`);
    if (auth.type === "basic" && auth.username && auth.password) h.set("Authorization", `Basic ${btoa(`${auth.username}:${auth.password}`)}`);
    if (auth.type === "header" && auth.headerName && auth.value) h.set(auth.headerName, auth.value);
}

export async function createUpstreamClient(u: UpstreamConfig): Promise<{ client: Client; dispose: () => Promise<void>; onStatus: (cb: StatusListener) => () => void }>{
    const listeners = new Set<StatusListener>();
    const notify = (s: { connected: boolean; lastError?: string }) => { for (const l of listeners) { try { l(s); } catch { /* ignore */ } } };

    if (u.transport === "stdio") {
        const transport = new StdioClientTransport({ command: u.command, args: u.args ?? [], cwd: u.cwd, env: u.env });
        const cfg = getConfigSync() ?? await loadConfig();
        const client = new Client({ name: `${DEFAULT_CLIENT_NAME_PREFIX}-${u.name}`, version: cfg.version });
        await client.connect(transport);
        notify({ connected: true });
        return {
            client,
            dispose: async () => { try { await transport.close?.(); } catch { /* ignore */ } },
            onStatus: (cb: StatusListener) => { listeners.add(cb); return () => listeners.delete(cb); }
        };
    }

    // Other transports are not supported by this helper; use RPC fallback elsewhere.
    throw new Error(`unsupported transport for createUpstreamClient: ${(u as { transport: string }).transport}`);
}



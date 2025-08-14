import { logDebug as _logDebug, logInfo, logWarn } from "@server/logger.ts";

type SessionRecord = {
  id: string;
  createdAt: number;
  lastSeenAt: number;
  close: () => void;
  enqueue: (line: Uint8Array) => void;
};

const encoder = new TextEncoder();
const sessions = new Map<string, SessionRecord>();

export function newSessionId(): string {
  try { return crypto.randomUUID(); } catch { return Math.random().toString(36).slice(2); }
}

export function createSession(opts: { id?: string; enqueue: (line: Uint8Array) => void; close: () => void; }): SessionRecord {
  const id = opts.id ?? newSessionId();
  const rec: SessionRecord = {
    id,
    createdAt: Date.now(),
    lastSeenAt: Date.now(),
    close: opts.close,
    enqueue: opts.enqueue,
  };
  sessions.set(id, rec);
  logInfo("mcp-sse", "session created", { id });
  return rec;
}

export function getSession(id: string | null): SessionRecord | undefined {
  if (!id) return undefined;
  return sessions.get(id);
}

export function touchSession(id: string): void {
  const s = sessions.get(id);
  if (s) s.lastSeenAt = Date.now();
}

export function closeSession(id: string): void {
  const s = sessions.get(id);
  if (!s) return;
  try { s.close(); } catch (_) { /* already closed */ }
  sessions.delete(id);
  logInfo("mcp-sse", "session closed", { id });
}

export function sweepIdleSessions(maxIdleMs: number): void {
  const now = Date.now();
  for (const [id, s] of sessions.entries()) {
    if (now - s.lastSeenAt > maxIdleMs) {
      logWarn("mcp-sse", "session idle timeout", { id });
      try { s.close(); } catch (_) { /* already closed */ }
      sessions.delete(id);
    }
  }
}

export function sseLine(data: unknown, event?: string): Uint8Array {
  const evt = event ? `event: ${event}\n` : "";
  return encoder.encode(`${evt}data: ${JSON.stringify(data)}\n\n`);
}



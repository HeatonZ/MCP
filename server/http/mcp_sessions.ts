import { logDebug, logInfo, logWarn } from "@server/logger.ts";

type SessionRecord = {
  id: string;
  createdAt: number;
  lastSeenAt: number;
  close: () => void;
  enqueue: (line: Uint8Array) => void;
  // 添加连接状态跟踪
  isActive: boolean;
  heartbeatCount: number;
  lastHeartbeat: number;
};

const encoder = new TextEncoder();
const sessions = new Map<string, SessionRecord>();

export function newSessionId(): string {
  try { return crypto.randomUUID(); } catch { return Math.random().toString(36).slice(2); }
}

export function createSession(opts: { id?: string; enqueue: (line: Uint8Array) => void; close: () => void; }): SessionRecord {
  const id = opts.id ?? newSessionId();
  const now = Date.now();
  const rec: SessionRecord = {
    id,
    createdAt: now,
    lastSeenAt: now,
    close: opts.close,
    enqueue: opts.enqueue,
    isActive: true,
    heartbeatCount: 0,
    lastHeartbeat: now,
  };
  sessions.set(id, rec);
  logInfo("mcp-sse", "session created", { id, timestamp: now });
  return rec;
}

export function getSession(id: string | null): SessionRecord | undefined {
  if (!id) return undefined;
  return sessions.get(id);
}

export function touchSession(id: string): void {
  const s = sessions.get(id);
  if (s) {
    const now = Date.now();
    s.lastSeenAt = now;
    s.isActive = true;
    logDebug("mcp-sse", "session touched", { id, timestamp: now });
  }
}

// 添加心跳更新函数
export function updateSessionHeartbeat(id: string): void {
  const s = sessions.get(id);
  if (s) {
    const now = Date.now();
    s.lastHeartbeat = now;
    s.heartbeatCount++;
    s.isActive = true;
    logDebug("mcp-sse", "session heartbeat", { id, count: s.heartbeatCount, timestamp: now });
  }
}

export function closeSession(id: string): void {
  const s = sessions.get(id);
  if (!s) return;
  
  // 标记为非活跃状态
  s.isActive = false;
  
  try { 
    s.close(); 
    logInfo("mcp-sse", "session closed successfully", { 
      id, 
      duration: Date.now() - s.createdAt,
      heartbeats: s.heartbeatCount 
    });
  } catch (error) { 
    logWarn("mcp-sse", "session close error", { id, error: String(error) });
  }
  
  sessions.delete(id);
}

export function sweepIdleSessions(maxIdleMs: number): void {
  const now = Date.now();
  const warningThreshold = maxIdleMs * 0.8; // 80%时发出警告
  
  for (const [id, s] of sessions.entries()) {
    const idleTime = now - s.lastSeenAt;
    const heartbeatIdle = now - s.lastHeartbeat;
    
    if (idleTime > maxIdleMs || heartbeatIdle > maxIdleMs * 2) {
      logWarn("mcp-sse", "session idle timeout", { 
        id, 
        idleMinutes: Math.round(idleTime / 60000),
        heartbeatIdleMinutes: Math.round(heartbeatIdle / 60000),
        totalHeartbeats: s.heartbeatCount
      });
      
      s.isActive = false;
      try { s.close(); } catch (_) { /* already closed */ }
      sessions.delete(id);
    } else if (idleTime > warningThreshold && s.isActive) {
      // 发送警告但不关闭连接
      try {
        s.enqueue(sseLine({ 
          type: "warning", 
          message: "Session will expire soon",
          expiresIn: maxIdleMs - idleTime 
        }, "session_warning"));
        logInfo("mcp-sse", "session expiration warning sent", { id });
      } catch (_) {
        // 如果无法发送警告，说明连接已经有问题
        logWarn("mcp-sse", "failed to send warning, marking inactive", { id });
        s.isActive = false;
      }
    }
  }
}

// 添加获取会话统计信息的函数
export function getSessionStats(): { total: number; active: number; avgHeartbeats: number } {
  const allSessions = Array.from(sessions.values());
  const activeSessions = allSessions.filter(s => s.isActive);
  const totalHeartbeats = allSessions.reduce((sum, s) => sum + s.heartbeatCount, 0);
  
  return {
    total: allSessions.length,
    active: activeSessions.length,
    avgHeartbeats: allSessions.length > 0 ? Math.round(totalHeartbeats / allSessions.length) : 0
  };
}

export function sseLine(data: unknown, event?: string): Uint8Array {
  const evt = event ? `event: ${event}\n` : "";
  return encoder.encode(`${evt}data: ${JSON.stringify(data)}\n\n`);
}



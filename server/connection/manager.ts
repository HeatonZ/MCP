/**
 * 统一的MCP连接管理器
 * 解决多用户、多连接场景下的稳定性问题
 */

import { logInfo, logWarn, logError } from "@server/logger.ts";

// 配置
const CONFIG = {
  MAX_CONNECTIONS: 100,           // 最大并发连接数
  MAX_CONNECTIONS_PER_IP: 10,     // 每个IP最大连接数
  SESSION_TIMEOUT: 30 * 60 * 1000, // 会话超时：30分钟
  CLEANUP_INTERVAL: 30 * 1000,    // 清理间隔：30秒
  HEALTH_CHECK_INTERVAL: 10 * 1000, // 健康检查间隔：10秒
  STALE_THRESHOLD: 60 * 1000,     // 无活动阈值：1分钟
  WARNING_THRESHOLD: 25 * 60 * 1000, // 过期警告阈值：25分钟
};

// 连接信息
interface Connection {
  id: string;
  ip: string;
  createdAt: number;
  lastSeenAt: number;
  lastHeartbeat: number;
  heartbeatCount: number;
  isActive: boolean;
  controller?: ReadableStreamDefaultController<Uint8Array>;
  cleanup?: () => void;
}

class ConnectionManager {
  private connections = new Map<string, Connection>();
  private connectionsByIp = new Map<string, Set<string>>();
  private cleanupTimer?: number;
  private healthCheckTimer?: number;

  constructor() {
    this.startCleanupScheduler();
    this.startHealthChecker();
  }

  /**
   * 创建新连接
   */
  createConnection(ip: string, connectionId?: string): Connection | null {
    // 检查全局连接数限制
    if (this.connections.size >= CONFIG.MAX_CONNECTIONS) {
      logWarn("connection-manager", "max connections reached", {
        current: this.connections.size,
        max: CONFIG.MAX_CONNECTIONS,
      });
      return null;
    }

    // 检查单IP连接数限制
    const ipConnections = this.connectionsByIp.get(ip);
    if (ipConnections && ipConnections.size >= CONFIG.MAX_CONNECTIONS_PER_IP) {
      logWarn("connection-manager", "max connections per IP reached", {
        ip,
        current: ipConnections.size,
        max: CONFIG.MAX_CONNECTIONS_PER_IP,
      });
      return null;
    }

    // 生成连接ID
    const id = connectionId || this.generateId();
    
    // 检查是否已存在
    if (this.connections.has(id)) {
      const existing = this.connections.get(id)!;
      existing.lastSeenAt = Date.now();
      return existing;
    }

    // 创建新连接
    const now = Date.now();
    const connection: Connection = {
      id,
      ip,
      createdAt: now,
      lastSeenAt: now,
      lastHeartbeat: now,
      heartbeatCount: 0,
      isActive: true,
    };

    this.connections.set(id, connection);

    // 更新IP索引
    if (!ipConnections) {
      this.connectionsByIp.set(ip, new Set([id]));
    } else {
      ipConnections.add(id);
    }

    logInfo("connection-manager", "connection created", {
      id,
      ip,
      totalConnections: this.connections.size,
      ipConnections: this.connectionsByIp.get(ip)?.size || 0,
    });

    return connection;
  }

  /**
   * 获取连接
   */
  getConnection(id: string): Connection | undefined {
    return this.connections.get(id);
  }

  /**
   * 更新连接活跃时间
   */
  touchConnection(id: string): void {
    const conn = this.connections.get(id);
    if (conn) {
      conn.lastSeenAt = Date.now();
      conn.isActive = true;
    }
  }

  /**
   * 更新心跳
   */
  updateHeartbeat(id: string): void {
    const conn = this.connections.get(id);
    if (conn) {
      const now = Date.now();
      conn.lastHeartbeat = now;
      conn.lastSeenAt = now;
      conn.heartbeatCount++;
      conn.isActive = true;
    }
  }

  /**
   * 关闭连接
   */
  closeConnection(id: string, reason = "normal"): void {
    const conn = this.connections.get(id);
    if (!conn) return;

    // 标记为非活跃
    conn.isActive = false;

    // 执行清理回调
    if (conn.cleanup) {
      try {
        conn.cleanup();
      } catch (error) {
        logError("connection-manager", "cleanup failed", { id, error: String(error) });
      }
    }

    // 关闭流控制器
    if (conn.controller) {
      try {
        conn.controller.close();
      } catch (_) {
        // ignore
      }
    }

    // 从IP索引中移除
    const ipConnections = this.connectionsByIp.get(conn.ip);
    if (ipConnections) {
      ipConnections.delete(id);
      if (ipConnections.size === 0) {
        this.connectionsByIp.delete(conn.ip);
      }
    }

    // 删除连接
    this.connections.delete(id);

    logInfo("connection-manager", "connection closed", {
      id,
      reason,
      duration: Date.now() - conn.createdAt,
      heartbeats: conn.heartbeatCount,
      remainingConnections: this.connections.size,
    });
  }

  /**
   * 清理过期连接
   */
  private cleanupExpiredConnections(): void {
    const now = Date.now();
    const expired: string[] = [];

    for (const [id, conn] of this.connections.entries()) {
      const age = now - conn.lastSeenAt;
      const heartbeatAge = now - conn.lastHeartbeat;

      // 检查是否过期
      if (age > CONFIG.SESSION_TIMEOUT || heartbeatAge > CONFIG.SESSION_TIMEOUT * 2) {
        expired.push(id);
        logWarn("connection-manager", "connection expired", {
          id,
          ageMinutes: Math.round(age / 60000),
          heartbeatAgeMinutes: Math.round(heartbeatAge / 60000),
        });
      }
      // 发送过期警告
      else if (age > CONFIG.WARNING_THRESHOLD && conn.controller && conn.isActive) {
        try {
          const encoder = new TextEncoder();
          conn.controller.enqueue(
            encoder.encode(
              `event: session_warning\ndata: ${JSON.stringify({
                type: "expiring_soon",
                expiresIn: CONFIG.SESSION_TIMEOUT - age,
                sessionId: id,
              })}\n\n`
            )
          );
        } catch (_) {
          // 发送失败，标记为非活跃
          conn.isActive = false;
        }
      }
    }

    // 关闭过期连接
    for (const id of expired) {
      this.closeConnection(id, "timeout");
    }

    if (expired.length > 0) {
      logInfo("connection-manager", "cleanup completed", {
        cleaned: expired.length,
        remaining: this.connections.size,
      });
    }
  }

  /**
   * 健康检查
   */
  private performHealthCheck(): void {
    const now = Date.now();

    for (const [id, conn] of this.connections.entries()) {
      if (!conn.controller || !conn.isActive) continue;

      const staleTime = now - conn.lastSeenAt;
      
      // 检查是否长时间无活动
      if (staleTime > CONFIG.STALE_THRESHOLD) {
        try {
          const encoder = new TextEncoder();
          conn.controller.enqueue(
            encoder.encode(`event: health_check\ndata: ${JSON.stringify({ timestamp: now })}\n\n`)
          );
        } catch (error) {
          logError("connection-manager", "health check failed", { id, error: String(error) });
          this.closeConnection(id, "health_check_failed");
        }
      }
    }
  }

  /**
   * 启动清理调度器
   */
  private startCleanupScheduler(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredConnections();
    }, CONFIG.CLEANUP_INTERVAL);
  }

  /**
   * 启动健康检查器
   */
  private startHealthChecker(): void {
    this.healthCheckTimer = setInterval(() => {
      this.performHealthCheck();
    }, CONFIG.HEALTH_CHECK_INTERVAL);
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    totalConnections: number;
    activeConnections: number;
    totalIPs: number;
    avgHeartbeats: number;
    connectionsByIp: Record<string, number>;
  } {
    const connections = Array.from(this.connections.values());
    const activeConnections = connections.filter((c) => c.isActive);
    const totalHeartbeats = connections.reduce((sum, c) => sum + c.heartbeatCount, 0);

    const connectionsByIp: Record<string, number> = {};
    for (const [ip, ids] of this.connectionsByIp.entries()) {
      connectionsByIp[ip] = ids.size;
    }

    return {
      totalConnections: connections.length,
      activeConnections: activeConnections.length,
      totalIPs: this.connectionsByIp.size,
      avgHeartbeats: connections.length > 0 ? Math.round(totalHeartbeats / connections.length) : 0,
      connectionsByIp,
    };
  }

  /**
   * 生成连接ID
   */
  private generateId(): string {
    try {
      return crypto.randomUUID();
    } catch {
      return Math.random().toString(36).slice(2) + Date.now().toString(36);
    }
  }

  /**
   * 停止管理器（用于清理）
   */
  stop(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }
    
    // 关闭所有连接
    for (const id of this.connections.keys()) {
      this.closeConnection(id, "shutdown");
    }
  }
}

// 单例实例
export const connectionManager = new ConnectionManager();


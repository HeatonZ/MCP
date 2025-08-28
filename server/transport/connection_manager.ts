import { logInfo, logError, logWarn } from "@server/logger.ts";

// 连接管理器 - 处理自动重连和连接恢复
export class ConnectionManager {
  private reconnectAttempts = new Map<string, number>();
  private reconnectTimers = new Map<string, number>();
  private maxReconnectAttempts = 5;
  private baseReconnectDelay = 1000; // 1秒
  private maxReconnectDelay = 30000; // 30秒

  constructor() {
    // 定期清理过期的重连尝试记录
    setInterval(() => this.cleanupReconnectAttempts(), 5 * 60 * 1000);
  }

  /**
   * 尝试重连指定的连接
   */
  attemptReconnect(connectionId: string, reconnectFn: () => Promise<boolean>): Promise<boolean> {
    const attempts = this.reconnectAttempts.get(connectionId) || 0;
    
    if (attempts >= this.maxReconnectAttempts) {
      logError("connection-manager", "max reconnect attempts reached", { connectionId, attempts });
      return false;
    }

    // 计算延迟时间（指数退避）
    const delay = Math.min(
      this.baseReconnectDelay * Math.pow(2, attempts),
      this.maxReconnectDelay
    );

    logInfo("connection-manager", "scheduling reconnect", { 
      connectionId, 
      attempt: attempts + 1, 
      delayMs: delay 
    });

    return new Promise((resolve) => {
      const timer = setTimeout(async () => {
        this.reconnectTimers.delete(connectionId);
        
        try {
          const success = await reconnectFn();
          
          if (success) {
            logInfo("connection-manager", "reconnect successful", { connectionId, attempts: attempts + 1 });
            this.reconnectAttempts.delete(connectionId);
            resolve(true);
          } else {
            this.reconnectAttempts.set(connectionId, attempts + 1);
            logWarn("connection-manager", "reconnect failed", { connectionId, attempts: attempts + 1 });
            resolve(false);
          }
        } catch (error) {
          this.reconnectAttempts.set(connectionId, attempts + 1);
          logError("connection-manager", "reconnect error", { 
            connectionId, 
            attempts: attempts + 1, 
            error: String(error) 
          });
          resolve(false);
        }
      }, delay);

      this.reconnectTimers.set(connectionId, timer);
    });
  }

  /**
   * 取消指定连接的重连尝试
   */
  cancelReconnect(connectionId: string): void {
    const timer = this.reconnectTimers.get(connectionId);
    if (timer) {
      clearTimeout(timer);
      this.reconnectTimers.delete(connectionId);
      logInfo("connection-manager", "reconnect cancelled", { connectionId });
    }
    this.reconnectAttempts.delete(connectionId);
  }

  /**
   * 重置指定连接的重连计数
   */
  resetReconnectCount(connectionId: string): void {
    this.reconnectAttempts.delete(connectionId);
    logInfo("connection-manager", "reconnect count reset", { connectionId });
  }

  /**
   * 获取连接的重连统计信息
   */
  getReconnectStats(connectionId: string): { attempts: number; isScheduled: boolean } {
    return {
      attempts: this.reconnectAttempts.get(connectionId) || 0,
      isScheduled: this.reconnectTimers.has(connectionId)
    };
  }

  /**
   * 获取所有连接的重连统计信息
   */
  getAllReconnectStats(): Record<string, { attempts: number; isScheduled: boolean }> {
    const stats: Record<string, { attempts: number; isScheduled: boolean }> = {};
    
    // 收集所有有记录的连接
    const allConnectionIds = new Set([
      ...this.reconnectAttempts.keys(),
      ...this.reconnectTimers.keys()
    ]);

    for (const connectionId of allConnectionIds) {
      stats[connectionId] = this.getReconnectStats(connectionId);
    }

    return stats;
  }

  /**
   * 清理过期的重连尝试记录
   */
  private cleanupReconnectAttempts(): void {
    // 清理没有活跃定时器的记录
    // 为了简化，我们保留这些记录，让它们在成功连接时被清理
    // 实际应用中可以添加更复杂的清理逻辑

    logInfo("connection-manager", "cleanup completed", { 
      activeReconnects: this.reconnectTimers.size,
      trackedConnections: this.reconnectAttempts.size
    });
  }

  /**
   * 销毁连接管理器，清理所有定时器
   */
  destroy(): void {
    for (const timer of this.reconnectTimers.values()) {
      clearTimeout(timer);
    }
    this.reconnectTimers.clear();
    this.reconnectAttempts.clear();
    logInfo("connection-manager", "connection manager destroyed");
  }
}

// 全局连接管理器实例
export const globalConnectionManager = new ConnectionManager();

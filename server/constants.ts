/**
 * 全局常量定义
 * 统一管理项目中的常量值，避免硬编码
 */

// MCP 协议版本
export const MCP_PROTOCOL_VERSION = "2024-11-05";

// 默认配置值
export const DEFAULT_SERVER_NAME = "deno-mcp-server";
export const DEFAULT_CLIENT_NAME_PREFIX = "mcp-proxy";

// 超时配置 (毫秒)
export const TIMEOUTS = {
  HTTP_REQUEST: 15000,        // HTTP 请求超时: 15秒
  HEARTBEAT_INTERVAL: 10000,  // 心跳间隔: 10秒
  HEARTBEAT_TIMEOUT: 30000,   // 心跳超时: 30秒
  HEALTH_CHECK: 5000,         // 健康检查超时: 5秒
  SESSION_IDLE: 30 * 60 * 1000, // 会话空闲超时: 30分钟
  SESSION_WARNING: 25 * 60 * 1000, // 会话过期警告: 25分钟
  STALE_THRESHOLD: 60 * 1000,  // 无活动阈值: 1分钟
} as const;

// 清理和检查间隔 (毫秒)
export const INTERVALS = {
  CLEANUP: 2 * 60 * 1000,      // 会话清理间隔: 2分钟
  CLEANUP_FAST: 30 * 1000,     // 快速清理间隔: 30秒
  HEALTH_CHECK: 30 * 1000,     // 健康检查间隔: 30秒
} as const;

// 重连配置
export const RECONNECT = {
  INITIAL_DELAY: 1000,         // 初始重连延迟: 1秒
  MAX_DELAY: 30000,            // 最大重连延迟: 30秒
  MAX_RETRIES: 5,              // 最大重试次数
  BACKOFF_FACTOR: 2,           // 退避因子
  CONSECUTIVE_FAILURES: 3,     // 触发重连的连续失败次数
} as const;

// 限制配置
export const LIMITS = {
  MAX_CONNECTIONS: 100,        // 最大并发连接数
  MAX_CONNECTIONS_PER_IP: 10,  // 每个IP最大连接数
  MAX_RESPONSE_BYTES: 1000000, // 最大响应字节数: 1MB
  MAX_LOGS: 1000,              // 最大日志条数
} as const;

// 默认端口
export const DEFAULT_HTTP_PORT = 8787;

// 默认允许的目录
export const DEFAULT_ALLOWED_DIRS = ["server", "config"];

// 默认 CORS 源
export const DEFAULT_CORS_ORIGINS = ["*"];


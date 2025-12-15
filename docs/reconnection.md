# 断线重连机制

## 概述

系统支持完整的上游连接断线重连机制，包括：

1. **自动重连**：连接失败时自动尝试重连
2. **健康监控**：定期检查连接健康状态
3. **指数退避**：重连延迟逐步增加，避免频繁重试
4. **可配置策略**：灵活的重连参数配置

## 配置说明

在 `config/mcp.config.json` 中为每个上游配置重连策略：

```json
{
  "upstreams": [
    {
      "name": "example-upstream",
      "transport": "http",
      "url": "https://example.com/mcp",
      "enabled": true,
      "reconnect": {
        "enabled": true,
        "maxRetries": 5,
        "initialDelayMs": 1000,
        "maxDelayMs": 30000,
        "factor": 2,
        "heartbeatMs": 30000
      }
    }
  ]
}
```

### 重连配置参数

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `enabled` | boolean | `true` | 是否启用断线重连 |
| `maxRetries` | number \| "infinite" | `5` | 最大重连次数，设为 "infinite" 表示无限重试 |
| `initialDelayMs` | number | `1000` | 初始重连延迟（毫秒） |
| `maxDelayMs` | number | `30000` | 最大重连延迟（毫秒） |
| `factor` | number | `2` | 延迟增长因子（指数退避） |
| `heartbeatMs` | number | `30000` | 健康检查间隔（毫秒），设为 0 禁用健康检查 |

### 重连策略说明

#### 指数退避算法

每次重连失败后，延迟时间按指数增长：

```
delay = min(initialDelayMs * factor^attempts, maxDelayMs)
```

例如，使用默认配置：
- 第 1 次重连：延迟 1秒 (1000ms)
- 第 2 次重连：延迟 2秒 (2000ms)
- 第 3 次重连：延迟 4秒 (4000ms)
- 第 4 次重连：延迟 8秒 (8000ms)
- 第 5 次重连：延迟 16秒 (16000ms)
- 第 6 次及以后：延迟 30秒 (达到最大值)

#### 健康监控机制

当 `heartbeatMs > 0` 时，系统会定期检查连接健康状态：

1. 每隔 `heartbeatMs` 毫秒执行一次健康检查
2. 健康检查通过调用 `listTools` API 实现
3. 连续失败 3 次后触发自动重连

## 配置示例

### 短期服务（快速重连）

适用于临时不稳定但恢复快的服务：

```json
{
  "reconnect": {
    "enabled": true,
    "maxRetries": 10,
    "initialDelayMs": 500,
    "maxDelayMs": 5000,
    "factor": 1.5,
    "heartbeatMs": 10000
  }
}
```

### 长期服务（稳定重连）

适用于稳定服务，偶尔断线：

```json
{
  "reconnect": {
    "enabled": true,
    "maxRetries": "infinite",
    "initialDelayMs": 2000,
    "maxDelayMs": 60000,
    "factor": 2,
    "heartbeatMs": 60000
  }
}
```

### 关键服务（无限重连）

适用于必须保持连接的关键服务：

```json
{
  "reconnect": {
    "enabled": true,
    "maxRetries": "infinite",
    "initialDelayMs": 1000,
    "maxDelayMs": 30000,
    "factor": 2,
    "heartbeatMs": 30000
  }
}
```

### 禁用重连

对于不需要自动重连的服务：

```json
{
  "reconnect": {
    "enabled": false
  }
}
```

## API 接口

### 查询连接状态

```http
GET /api/upstream/status
```

返回所有上游的连接状态：

```json
{
  "example-upstream": {
    "connected": true,
    "lastHealthCheck": 1702123456789,
    "consecutiveFailures": 0,
    "reconnectStats": {
      "attempts": 0,
      "isScheduled": false
    }
  },
  "another-upstream": {
    "connected": false,
    "reconnectStats": {
      "attempts": 3,
      "isScheduled": true
    }
  }
}
```

### 手动触发重连

```http
POST /api/upstream/reconnect/:upstreamName
```

返回：

```json
{
  "success": true,
  "upstream": "example-upstream"
}
```

## 工作原理

### 初始化流程

1. 系统启动时尝试连接所有已配置的上游
2. 连接成功后启动健康监控定时器
3. 连接失败时根据重连配置启动重连机制

### 断线检测

系统通过以下方式检测断线：

1. **初始连接失败**：启动时无法建立连接
2. **健康检查失败**：定期健康检查连续失败 3 次
3. **调用失败**：工具调用时发现连接已断开

### 重连流程

1. 根据重连配置计算延迟时间
2. 等待延迟后尝试重新建立连接
3. 重连成功：
   - 重置重连计数器
   - 启动健康监控
   - 标记为已连接状态
4. 重连失败：
   - 增加重连计数器
   - 如果未达到最大次数，继续尝试
   - 如果达到最大次数，停止重连并记录错误

## 日志监控

系统会记录以下重连相关的日志：

```
[connection-manager] scheduling reconnect: { connectionId: "upstream-name", attempt: 1, delayMs: 1000, maxRetries: 5 }
[connection-manager] reconnect successful: { connectionId: "upstream-name", attempts: 1 }
[connection-manager] reconnect failed: { connectionId: "upstream-name", attempts: 1 }
[connection-manager] max reconnect attempts reached: { connectionId: "upstream-name", attempts: 5 }
[upstream] health check failed: { name: "upstream-name", error: "...", consecutiveFailures: 3 }
[upstream] health monitoring started: { name: "upstream-name", heartbeatMs: 30000 }
[upstream] health monitoring stopped: { name: "upstream-name" }
```

## 最佳实践

1. **合理设置重连次数**：
   - 开发环境：较少的重连次数（3-5次）
   - 生产环境：较多的重连次数或无限重试

2. **调整健康检查间隔**：
   - 稳定服务：较长的间隔（60秒）
   - 不稳定服务：较短的间隔（10-30秒）
   - 降低检查频率可以减少资源消耗

3. **指数退避参数**：
   - 使用默认的 `factor: 2` 在大多数情况下效果良好
   - 对于预期恢复慢的服务，可以增加 `initialDelayMs`

4. **监控和告警**：
   - 定期检查 `/api/upstream/status` 端点
   - 对连续重连失败设置告警
   - 监控 `consecutiveFailures` 指标

## 故障排查

### 连接一直处于重连状态

1. 检查上游服务是否正常运行
2. 验证网络连接和防火墙设置
3. 检查认证配置是否正确
4. 查看日志了解具体错误信息

### 健康检查频繁失败

1. 增加健康检查超时时间
2. 检查上游服务性能
3. 考虑增加 `heartbeatMs` 间隔
4. 验证 `listTools` API 是否可用

### 重连次数过多

1. 检查是否应该设置 `maxRetries` 限制
2. 评估是否需要无限重连
3. 考虑增加 `initialDelayMs` 避免频繁重试

## 与其他功能的集成

### 定期刷新

系统支持定期刷新所有上游连接，配置如下：

```json
{
  "upstreamRefresh": {
    "intervalMinutes": 60
  }
}
```

定期刷新会重新建立所有上游连接，与断线重连机制配合使用。

### 指标监控

系统会记录重连相关的指标：

- `mcp_upstream_connected`：上游连接状态（0/1）
- `mcp_upstream_reconnects_total`：累计重连次数
- `mcp_upstream_health_check_failures_total`：健康检查失败次数

这些指标可用于监控和告警。



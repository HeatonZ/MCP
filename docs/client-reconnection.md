# AI 编辑器客户端断线重连指南

## 概述

当 AI 编辑器（如 Claude Desktop、Cursor、Windsurf 等）通过 MCP 协议连接到本系统时，如果出现网络断联或服务重启，需要客户端和服务端共同配合处理断线重连。

## 服务端支持的断线处理机制

### 1. 会话保持和超时管理

本系统作为 MCP 服务器，实现了以下客户端连接管理机制：

#### SSE（Server-Sent Events）连接

- **心跳机制**：每 10 秒发送一次 keep-alive 心跳
- **会话超时**：30 分钟无活动后自动关闭会话
- **过期警告**：在 25 分钟时发送警告通知
- **会话恢复**：支持通过 session ID 恢复已有会话

```typescript
// 服务端会定期发送心跳
: keep-alive-{count} {timestamp}

// 过期警告事件
event: session_warning
data: {"reason":"expiring_soon","sessionId":"xxx","expiresIn":300000}

// 会话过期事件
event: session_expired
data: {"reason":"timeout","sessionId":"xxx"}
```

#### HTTP Streamable 连接

- **Session ID 机制**：通过 `Mcp-Session-Id` 头传递会话标识
- **流式响应**：支持长连接和流式数据传输
- **自动清理**：定期清理过期会话（每 2 分钟）

### 2. 连接状态监控

服务端提供以下 API 用于监控连接状态：

```bash
# 查看活跃会话统计
GET /api/mcp/sessions

# 查看系统诊断信息
GET /api/mcp/diagnostics

# 查看上游连接状态
GET /api/upstream/status
```

### 3. 错误恢复

服务端在以下情况下会尝试维护连接或优雅降级：

- **网络中断**：通过心跳检测断线，保持会话状态
- **请求超时**：自动清理超时的请求和会话
- **资源限制**：限制每个 IP 最多 10 个并发连接

## 客户端断线重连最佳实践

### 1. Claude Desktop 配置

Claude Desktop 原生支持 MCP 协议，需要在配置文件中正确设置服务器连接：

**配置文件位置**：
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

**HTTP/SSE 连接配置**：

```json
{
  "mcpServers": {
    "your-server-name": {
      "url": "http://10.254.61.224:8787/message",
      "transport": "sse"
    }
  }
}
```

**Stdio 连接配置**：

```json
{
  "mcpServers": {
    "your-server-name": {
      "command": "deno",
      "args": ["run", "-A", "/path/to/MCP/server/stdio.ts"],
      "env": {
        "CONFIG_PATH": "/path/to/config.json"
      }
    }
  }
}
```

#### Claude Desktop 的重连行为

Claude Desktop 会自动处理以下情况：

1. **Stdio 进程退出**：会自动重启进程
2. **HTTP/SSE 连接断开**：需要手动重新连接（刷新对话）
3. **网络恢复**：自动重试连接

**建议**：
- 使用 Stdio 传输方式获得最佳稳定性（自动重启）
- HTTP/SSE 方式适合远程服务器，但需要手动重连

### 2. Cursor 配置

Cursor 通过 `.cursor/mcp.json` 配置 MCP 服务：

```json
{
  "mcpServers": {
    "your-server-name": {
      "command": "deno",
      "args": ["run", "-A", "/path/to/MCP/server/stdio.ts"]
    }
  }
}
```

**Cursor 的重连特性**：
- 自动重启 stdio 进程
- 连接失败时在 MCP 面板显示错误
- 需要重启 Cursor 才能重新加载配置

### 3. Windsurf 配置

Windsurf 支持类似的 MCP 配置方式。

### 4. 通用客户端建议

无论使用哪个 AI 编辑器，以下是断线重连的最佳实践：

#### 传输方式选择

| 传输方式 | 优点 | 缺点 | 适用场景 |
|---------|------|------|---------|
| **Stdio** | • 自动重启<br>• 稳定性高<br>• 进程隔离 | • 仅本地<br>• 配置复杂 | 本地开发 |
| **HTTP** | • 支持远程<br>• 简单直接 | • 需要手动重连<br>• 无状态 | 无状态服务 |
| **SSE** | • 支持远程<br>• 实时推送<br>• 会话保持 | • 需要手动重连<br>• 超时限制 | 远程服务 |

#### 配置建议

1. **本地开发**：优先使用 Stdio
   ```json
   {
     "command": "deno",
     "args": ["run", "-A", "/path/to/MCP/server/stdio.ts"]
   }
   ```

2. **远程服务器**：使用 HTTP/SSE 并配置合理的超时
   ```json
   {
     "url": "http://your-server:8787/message",
     "transport": "sse",
     "timeout": 30000,
     "retries": 3
   }
   ```

3. **生产环境**：配合反向代理使用
   ```nginx
   location /mcp/ {
     proxy_pass http://localhost:8787/;
     proxy_http_version 1.1;
     proxy_set_header Connection "";
     proxy_buffering off;
     proxy_read_timeout 3600s;
   }
   ```

## 客户端断线场景处理

### 场景 1：服务器重启

**现象**：
- Stdio: 进程退出，客户端自动重启
- HTTP/SSE: 连接断开，需要手动重连

**处理**：
- Stdio 用户：无需操作，自动恢复
- HTTP/SSE 用户：刷新对话或重启编辑器

### 场景 2：网络中断

**现象**：
- 心跳超时
- 请求失败
- 会话过期

**处理**：
1. 检查网络连接
2. 等待网络恢复
3. 刷新对话或重启编辑器

### 场景 3：会话超时

**现象**：
- 收到 `session_warning` 事件
- 收到 `session_expired` 事件

**处理**：
- 客户端应实现自动续期逻辑
- 或在超时前重新建立连接

### 场景 4：服务端配置更改

**现象**：
- 工具列表变化
- 功能不可用

**处理**：
1. 服务端：执行配置热重载
2. 客户端：重新初始化 MCP 连接

## 开发调试指南

### 1. 启用调试日志

**服务端日志**：

```bash
# 查看实时日志
tail -f logs/app.log

# 过滤连接相关日志
tail -f logs/app.log | grep -E "connection|session|heartbeat"
```

**客户端日志**：

- **Claude Desktop**: 查看开发者工具控制台（Help → Developer Tools）
- **Cursor**: 查看输出面板的 MCP 日志
- **Windsurf**: 查看 MCP 调试面板

### 2. 测试连接状态

```bash
# 测试服务器可用性
curl http://localhost:8787/api/health

# 查看会话状态
curl http://localhost:8787/api/mcp/sessions

# 测试 SSE 连接
curl -N -H "Accept: text/event-stream" \
  http://localhost:8787/message?session=test-session
```

### 3. 模拟断线场景

```bash
# 1. 启动服务器
deno task dev:server

# 2. 建立客户端连接
# （在 AI 编辑器中连接）

# 3. 模拟服务器重启
# 停止并重启服务器

# 4. 观察客户端行为
# - Stdio: 应该自动重连
# - HTTP/SSE: 显示错误，需要手动重连
```

## 监控和告警

### 推荐监控指标

1. **连接数监控**
   - 活跃连接数
   - 每 IP 连接数
   - 连接增长趋势

2. **会话健康度**
   - 平均会话时长
   - 会话超时率
   - 心跳成功率

3. **错误率**
   - 连接失败率
   - 请求超时率
   - 会话过期率

### 告警设置建议

```yaml
alerts:
  - name: 连接数过高
    condition: active_connections > 80
    action: 警告并限流
  
  - name: 会话超时率高
    condition: timeout_rate > 10%
    action: 检查网络和服务器性能
  
  - name: 心跳失败率高
    condition: heartbeat_failure_rate > 5%
    action: 检查客户端网络
```

## 常见问题 (FAQ)

### Q1: Claude Desktop 频繁断线怎么办？

**A**: 
1. 检查是否使用 Stdio 模式（推荐）
2. 检查服务器日志是否有错误
3. 确认网络连接稳定
4. 尝试增加超时时间配置

### Q2: Cursor 无法连接到远程服务器？

**A**: 
Cursor 目前主要支持本地 Stdio 连接。如需连接远程服务器：
1. 在远程服务器上运行 MCP 服务
2. 使用 SSH 隧道转发端口
3. 配置为本地 Stdio 方式

### Q3: 如何知道连接是否正常？

**A**: 
1. 查看客户端的 MCP 状态指示器
2. 尝试调用一个简单的工具
3. 访问 `/api/mcp/sessions` 查看会话状态
4. 检查服务器日志的心跳记录

### Q4: 会话过期后需要重新初始化吗？

**A**: 
是的。会话过期后：
1. 客户端需要重新建立连接
2. 服务端会重新初始化 MCP 协议
3. 工具列表会重新加载
4. 之前的会话状态会丢失

### Q5: 支持多个客户端同时连接吗？

**A**: 
支持。本系统支持多客户端并发连接：
- 每个客户端有独立的会话 ID
- 默认限制每个 IP 最多 10 个连接
- 可以在配置中调整连接限制

## 相关文档

- [断线重连机制](reconnection.md) - 上游连接的断线重连配置
- [MCP 协议规范](https://spec.modelcontextprotocol.io/) - 官方协议文档
- [配置参考](../config/config.json) - 服务器配置示例

## 技术支持

如果遇到连接问题：

1. **查看日志**：检查服务器日志了解详细错误
2. **测试连接**：使用 curl 测试端点可用性
3. **检查配置**：验证客户端和服务端配置正确
4. **网络诊断**：确认网络连接和防火墙设置

更多问题请参考系统日志或提交 Issue。



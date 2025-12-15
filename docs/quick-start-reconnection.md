# 断线重连快速开始指南

## 5 分钟配置断线重连

### 步骤 1：启用上游自动重连

编辑 `config/config.json`，为每个上游添加 `reconnect` 配置：

```json
{
  "upstreams": [
    {
      "name": "your-upstream",
      "transport": "stdio",
      "command": "your-command",
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

### 步骤 2：配置客户端（AI 编辑器）

#### Claude Desktop

**推荐：Stdio 模式（自动重连）**

编辑 Claude Desktop 配置文件：
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "your-server": {
      "command": "deno",
      "args": ["run", "-A", "/path/to/MCP/server/stdio.ts"]
    }
  }
}
```

#### Cursor

在项目根目录创建 `.cursor/mcp.json`：

```json
{
  "mcpServers": {
    "your-server": {
      "command": "deno",
      "args": ["run", "-A", "/path/to/MCP/server/stdio.ts"]
    }
  }
}
```

### 步骤 3：启动服务

```bash
# 开发模式
deno task dev

# 或仅启动后端
deno task dev:server
```

### 步骤 4：验证连接

```bash
# 检查服务器健康状态
curl http://localhost:8787/api/health

# 查看上游连接状态
curl http://localhost:8787/api/upstream/status

# 查看活跃会话
curl http://localhost:8787/api/mcp/sessions
```

## 常用配置模板

### 模板 1：稳定的本地服务

适用于：本地运行的稳定服务

```json
{
  "reconnect": {
    "enabled": true,
    "maxRetries": 3,
    "initialDelayMs": 500,
    "maxDelayMs": 5000,
    "factor": 2,
    "heartbeatMs": 60000
  }
}
```

### 模板 2：不稳定的远程服务

适用于：网络不稳定的远程服务

```json
{
  "reconnect": {
    "enabled": true,
    "maxRetries": 10,
    "initialDelayMs": 2000,
    "maxDelayMs": 60000,
    "factor": 2,
    "heartbeatMs": 30000
  }
}
```

### 模板 3：关键服务（无限重连）

适用于：必须保持连接的关键服务

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

### 模板 4：禁用重连

适用于：不需要自动重连的服务

```json
{
  "reconnect": {
    "enabled": false
  }
}
```

## 快速故障排查

### 问题 1：上游连接失败

```bash
# 1. 查看连接状态
curl http://localhost:8787/api/upstream/status

# 2. 查看日志
tail -f logs/app.log | grep upstream

# 3. 手动触发重连
curl -X POST http://localhost:8787/api/upstream/reconnect/your-upstream-name
```

### 问题 2：客户端频繁断线

```bash
# 1. 检查会话状态
curl http://localhost:8787/api/mcp/sessions

# 2. 查看心跳日志
tail -f logs/app.log | grep heartbeat

# 3. 增加会话超时时间
# 编辑 config/config.json
{
  "connection": {
    "session": {
      "maxIdleMs": 3600000  // 增加到 60 分钟
    }
  }
}
```

### 问题 3：重连次数用尽

```bash
# 1. 查看重连统计
curl http://localhost:8787/api/upstream/status

# 2. 检查上游服务是否正常
# 根据上游类型进行检查

# 3. 调整重连策略
{
  "reconnect": {
    "maxRetries": "infinite",  // 改为无限重试
    "initialDelayMs": 5000     // 增加初始延迟
  }
}
```

## 监控仪表板

使用前端监控页面查看实时状态：

```bash
# 启动前端
cd frontend
pnpm install
pnpm dev

# 访问
http://localhost:5173
```

在监控页面可以看到：
- 所有上游的连接状态
- 重连次数和统计
- 健康检查结果
- 活跃会话数

## 下一步

- 📖 阅读 [完整架构文档](connection-architecture.md)
- 🔧 配置 [上游重连策略](reconnection.md)
- 💻 设置 [客户端连接](client-reconnection.md)
- 📊 启用 [监控告警](connection-architecture.md#监控和诊断)

## 测试清单

完成配置后，测试以下场景：

- [ ] 服务器正常启动，上游连接成功
- [ ] 客户端（AI 编辑器）可以正常连接
- [ ] 工具调用正常工作
- [ ] 模拟上游服务重启，观察自动重连
- [ ] 模拟网络中断，观察重连行为
- [ ] 检查日志记录是否完整
- [ ] 访问监控 API 查看状态
- [ ] 测试手动触发重连功能

## 需要帮助？

- 查看 [FAQ](client-reconnection.md#常见问题-faq)
- 检查 [日志文件](connection-architecture.md#日志监控)
- 访问 [诊断 API](connection-architecture.md#监控端点)
- 提交 Issue 并附上日志和配置


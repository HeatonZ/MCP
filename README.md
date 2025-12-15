# z-mcp (Deno + TypeScript MCP Server with Vue3 + Element Plus Frontend)

## 快速开始

1. 安装依赖
- 需要 Deno 最新版本
- 前端使用 pnpm（包含 Element Plus）

2. 一键启动（同时启动后端与前端）
```bash
deno task dev
```

3. 一键测试（前后端）
```bash
deno task test
```
- 仅后端：`deno task test:backend`
- 仅前端：`deno task test:frontend`

4. 分别启动
```bash
# 后端（管理 API）
deno task dev:server
# MCP stdio 入口
deno task dev:server:stdio
# 前端
pnpm --dir frontend install
pnpm --dir frontend dev
```

## 路径别名
- Deno import map：`@server/`, `@server-tools/`, `@shared/`
- 前端 Vite alias：`@shared` 指向 `../shared`

## 结构
- `server/` MCP 服务与管理 API
- `server/tools/` 工具分类（core、fs、http、kv ...）
- `shared/types/` 统一类型目录（system、api、log、tool）
- `config/` 配置文件
- `frontend/` Vue3 + Element Plus + Monaco
- `docs/` 文档目录

## 文档

### 快速开始
- [断线重连快速开始](docs/quick-start-reconnection.md) - ⚡ 5分钟快速配置断线重连

### 架构和原理
- [连接架构和断线重连体系](docs/connection-architecture.md) - 完整的连接架构和三层重连机制说明
- [断线重连机制](docs/reconnection.md) - 上游连接的自动重连配置和使用说明

### 客户端配置
- [AI 编辑器客户端断线重连指南](docs/client-reconnection.md) - Claude Desktop、Cursor 等客户端的连接和重连处理
- [Cursor 连接故障排查](docs/cursor-troubleshooting.md) - 🔧 解决 "No stored tokens found" 等 Cursor 连接问题

## Docker
```bash
docker build -t z-mcp:latest .
docker run --rm -p 8787:8787 z-mcp:latest
```

## 构建
```bash
deno task build:server
# 产物：dist/z-mcp-server
``` 
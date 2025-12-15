# Cursor MCP 连接故障排查

## 问题：No stored tokens found

### 问题分析

当 Cursor 连接 MCP 服务时提示 "No stored tokens found"，这通常**不是服务器端的问题**，而是 Cursor 客户端的配置或缓存问题。

可能的原因：
1. Cursor 的 MCP 配置文件格式不正确
2. Cursor 缓存损坏
3. 使用了错误的传输协议
4. Cursor 版本不支持该配置方式

### 解决方案

## 方案 1：使用 Stdio 模式（推荐）

Cursor 最稳定的 MCP 连接方式是 **Stdio 模式**（本地进程通信）。

### 步骤 1：创建配置文件

在项目根目录创建 `.cursorrules` 或 `.cursor/mcp.json` 文件：

**选项 A：使用 `.cursor/mcp.json`（推荐）**

```json
{
  "mcpServers": {
    "z-mcp": {
      "command": "deno",
      "args": [
        "run",
        "-A",
        "/root/front-end/MCP/server/stdio.ts"
      ],
      "env": {
        "CONFIG_PATH": "/root/front-end/MCP/config/config.json"
      }
    }
  }
}
```

**选项 B：使用相对路径（如果在项目内）**

```json
{
  "mcpServers": {
    "z-mcp": {
      "command": "deno",
      "args": [
        "run",
        "-A",
        "./server/stdio.ts"
      ]
    }
  }
}
```

### 步骤 2：重启 Cursor

1. 保存配置文件
2. 完全退出 Cursor（不是关闭窗口，而是退出应用）
3. 重新打开 Cursor
4. 打开项目文件夹

### 步骤 3：验证连接

1. 打开 Cursor 的命令面板（Cmd/Ctrl + Shift + P）
2. 搜索 "MCP"
3. 查看 MCP 服务器状态

或者在 Cursor 的输出面板查看 MCP 日志。

## 方案 2：清除 Cursor 缓存

如果方案 1 不工作，可能是缓存问题。

### macOS

```bash
# 1. 完全退出 Cursor

# 2. 清除缓存
rm -rf ~/Library/Application\ Support/Cursor/Cache
rm -rf ~/Library/Application\ Support/Cursor/CachedData
rm -rf ~/Library/Application\ Support/Cursor/Code\ Cache

# 3. 清除 MCP 配置缓存
rm -rf ~/Library/Application\ Support/Cursor/User/globalStorage/mcp-*

# 4. 重启 Cursor
```

### Linux

```bash
# 1. 完全退出 Cursor

# 2. 清除缓存
rm -rf ~/.config/Cursor/Cache
rm -rf ~/.config/Cursor/CachedData
rm -rf ~/.config/Cursor/Code\ Cache

# 3. 清除 MCP 配置缓存
rm -rf ~/.config/Cursor/User/globalStorage/mcp-*

# 4. 重启 Cursor
```

### Windows

```powershell
# 1. 完全退出 Cursor

# 2. 删除以下文件夹：
# %APPDATA%\Cursor\Cache
# %APPDATA%\Cursor\CachedData
# %APPDATA%\Cursor\Code Cache
# %APPDATA%\Cursor\User\globalStorage\mcp-*

# 3. 重启 Cursor
```

## 方案 3：检查 Stdio 入口文件

确认 `server/stdio.ts` 文件存在且正确：

```bash
# 检查文件是否存在
ls -la /root/front-end/MCP/server/stdio.ts

# 测试文件是否可以运行
deno run -A /root/front-end/MCP/server/stdio.ts
```

如果文件不存在或有错误，需要先修复。

## 方案 4：检查配置文件路径

确认所有路径使用**绝对路径**：

```json
{
  "mcpServers": {
    "z-mcp": {
      "command": "deno",
      "args": [
        "run",
        "-A",
        "/root/front-end/MCP/server/stdio.ts"
      ],
      "env": {
        "CONFIG_PATH": "/root/front-end/MCP/config/config.json"
      }
    }
  }
}
```

## 方案 5：检查 Deno 是否可用

```bash
# 检查 deno 是否安装
which deno

# 检查 deno 版本
deno --version

# 如果 deno 不在 PATH 中，使用完整路径
{
  "mcpServers": {
    "z-mcp": {
      "command": "/usr/local/bin/deno",  // 使用完整路径
      "args": ["run", "-A", "/root/front-end/MCP/server/stdio.ts"]
    }
  }
}
```

## 方案 6：使用远程 HTTP 模式（不推荐）

如果必须使用远程连接，Cursor 对 HTTP/SSE 的支持可能不完整。可以尝试：

### 启动 HTTP 服务器

```bash
cd /root/front-end/MCP
deno task dev:server
```

### 配置（实验性，可能不工作）

```json
{
  "mcpServers": {
    "z-mcp": {
      "url": "http://10.254.61.224:8787/message",
      "transport": "http"
    }
  }
}
```

**注意**：Cursor 的 HTTP/SSE 支持可能不完整或不稳定。

## 调试步骤

### 1. 查看 Cursor 日志

**打开输出面板**：
1. 菜单：View → Output
2. 在下拉菜单中选择 "MCP" 或 "Extension Host"

**查看日志内容**：
- 连接尝试记录
- 错误信息
- MCP 协议交互

### 2. 查看服务器日志

如果使用 Stdio 模式，服务器日志会输出到 Cursor 的输出面板。

如果使用 HTTP 模式：

```bash
# 查看服务器日志
tail -f /root/front-end/MCP/logs/app.log

# 或启动时实时查看
deno task dev:server
```

### 3. 测试服务器是否正常

```bash
# 测试 Stdio 入口
echo '{"jsonrpc":"2.0","method":"initialize","params":{},"id":1}' | \
  deno run -A /root/front-end/MCP/server/stdio.ts

# 测试 HTTP 端点
curl http://localhost:8787/api/health
```

### 4. 检查配置文件语法

```bash
# 验证 JSON 语法
cat .cursor/mcp.json | jq .

# 如果报错，说明 JSON 格式不正确
```

## 常见错误和解决方案

### 错误 1：No stored tokens found

**原因**：Cursor 配置缓存问题或配置格式错误

**解决**：
1. 清除缓存（见方案 2）
2. 检查配置文件格式
3. 重启 Cursor

### 错误 2：Command not found

**原因**：`deno` 命令不在 PATH 中

**解决**：
```json
{
  "command": "/usr/local/bin/deno"  // 使用完整路径
}
```

### 错误 3：Permission denied

**原因**：文件权限问题

**解决**：
```bash
chmod +x /root/front-end/MCP/server/stdio.ts
```

### 错误 4：Module not found

**原因**：配置的路径不正确

**解决**：
1. 检查路径是否正确
2. 使用绝对路径
3. 确认文件存在

### 错误 5：Connection refused

**原因**：服务器未启动（仅 HTTP 模式）

**解决**：
```bash
deno task dev:server
```

## 完整配置示例

### 本地开发（Stdio 模式）

```json
{
  "mcpServers": {
    "z-mcp": {
      "command": "deno",
      "args": [
        "run",
        "--allow-all",
        "/root/front-end/MCP/server/stdio.ts"
      ],
      "env": {
        "CONFIG_PATH": "/root/front-end/MCP/config/config.json",
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

### 生产环境（Stdio 模式 + 编译后）

如果已经编译服务器：

```json
{
  "mcpServers": {
    "z-mcp": {
      "command": "/root/front-end/MCP/dist/z-mcp-server",
      "args": ["--stdio"]
    }
  }
}
```

## 推荐配置流程

1. ✅ **第一步**：创建 `.cursor/mcp.json` 配置文件（使用 Stdio 模式）
2. ✅ **第二步**：使用绝对路径
3. ✅ **第三步**：完全重启 Cursor
4. ✅ **第四步**：检查输出面板的 MCP 日志
5. ✅ **第五步**：如果有问题，清除缓存并重试

## 验证连接成功

连接成功后，你应该能够：

1. 在 Cursor 的 MCP 面板看到服务器状态为 "Connected"
2. 在对话中使用 MCP 提供的工具
3. 在输出面板看到工具调用日志

示例输出：
```
[MCP] Connected to z-mcp
[MCP] Available tools: 15
[MCP] Tool called: context7_search
```

## 对比其他 AI 编辑器

| 编辑器 | MCP 支持 | 推荐模式 | 稳定性 |
|--------|---------|---------|--------|
| Claude Desktop | ✅ 完整支持 | Stdio | ⭐⭐⭐⭐⭐ |
| Cursor | ✅ 基本支持 | Stdio | ⭐⭐⭐⭐ |
| Windsurf | ✅ 支持 | Stdio | ⭐⭐⭐⭐ |
| VS Code | ⚠️ 需插件 | Stdio | ⭐⭐⭐ |

**注意**：
- Cursor 的 MCP 支持仍在完善中
- Stdio 模式最稳定
- HTTP/SSE 模式支持有限

## 如果问题仍未解决

1. **检查 Cursor 版本**
   ```bash
   # 确保使用最新版本的 Cursor
   # 某些旧版本可能不支持 MCP
   ```

2. **使用 Claude Desktop 进行对比测试**
   - 使用相同的配置在 Claude Desktop 测试
   - 如果 Claude Desktop 能工作，说明服务器没问题
   - 问题在于 Cursor 的 MCP 实现

3. **提交 Issue**
   ```
   问题标题：Cursor MCP 连接问题
   
   环境信息：
   - Cursor 版本：[版本号]
   - 操作系统：[系统]
   - Deno 版本：[版本]
   - 错误信息：[完整的错误日志]
   - 配置文件：[粘贴配置]
   ```

4. **联系 Cursor 支持**
   - 这可能是 Cursor 的 bug
   - 提供完整的日志和配置信息

## 相关文档

- [AI 编辑器客户端断线重连指南](client-reconnection.md)
- [连接架构文档](connection-architecture.md)
- [快速开始指南](quick-start-reconnection.md)

## 技术支持

如果以上方法都无法解决问题：

1. 收集完整的错误日志
2. 记录详细的操作步骤
3. 提供配置文件内容
4. 说明 Cursor 版本和操作系统
5. 提交 Issue 或寻求帮助



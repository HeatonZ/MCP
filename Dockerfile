# syntax=docker/dockerfile:1.7-labs

FROM denoland/deno:latest AS deno

FROM node:20 AS frontend
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
COPY frontend/package.json frontend/pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile || pnpm install
COPY frontend ./
RUN pnpm build

FROM deno AS runner
WORKDIR /app

# 创建非 root 用户（安全最佳实践）
RUN addgroup -g 1000 deno && adduser -u 1000 -G deno -s /bin/sh -D deno

# 复制依赖配置文件（利用 Docker 缓存层）
COPY deno.jsonc deno.lock import_map.json ./

# 复制后端源码
COPY server ./server
COPY shared ./shared
COPY config ./config

# 复制前端产物
COPY --from=frontend /app/dist ./public

# 运行时环境变量
ENV DENO_DIR=/deno-dir
RUN mkdir -p $DENO_DIR && chown -R deno:deno /app $DENO_DIR

# 预抓取依赖
RUN deno cache --import-map=import_map.json server/main.ts server/stdio.ts || true

# 切换到非 root 用户
USER deno

# 健康检查（每30秒检查一次，超时10秒）
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8787/api/health || exit 1

EXPOSE 8787

# 生产环境仅开启后端 HTTP 管理 API；前端静态文件由该 API 提供
CMD ["deno", "run", "-A", "--import-map=import_map.json", "server/main.ts"]

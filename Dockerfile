# syntax=docker/dockerfile:1.7-labs

FROM denoland/deno:alpine-2.1.4 AS deno

FROM node:20-alpine AS frontend
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
COPY frontend/package.json frontend/pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile || pnpm install
COPY frontend ./
RUN pnpm build

FROM deno AS runner
WORKDIR /app
# 复制后端与配置
COPY deno.jsonc ./deno.jsonc
COPY server ./server
COPY config ./config
# 复制前端产物
COPY --from=frontend /app/dist ./public

# 运行时环境变量
ENV DENO_DIR=/deno-dir
RUN mkdir -p $DENO_DIR

# 预抓取依赖（可选）
RUN deno cache server/main.ts server/stdio.ts || true

EXPOSE 8787 5173
# 生产环境仅开启后端 HTTP 管理 API；前端静态文件由该 API 提供
CMD ["deno", "run", "-A", "server/main.ts"] 
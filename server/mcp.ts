import { McpServer, ResourceTemplate } from "npm:@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "npm:zod";
import { getConfigSync, loadConfig } from "@server/config.ts";
import { getAllTools } from "@server/tools.ts";
import { listAggregatedResources, readAggregatedResource, listAggregatedPrompts, getAggregatedPrompt } from "@server/upstream/index.ts";

export async function createMcpServer(): Promise<McpServer> {
  const server = new McpServer({
    name: getConfigSync()?.serverName ?? "deno-mcp",
    version: getConfigSync()?.version ?? "0.0.0"
  });

  // 插件初始化应在进程启动时进行，避免此处重复初始化导致工具重复注册

  // 上游资源桥接：将上游资源注册为本地资源（使用自定义 scheme）
  const bridgedResourceMap = new Map<string, { upstream: string; originalUri: string; mimeType?: string; title?: string }>();
  try {
    const upstreamResources = await listAggregatedResources();
    for (let i = 0; i < upstreamResources.length; i++) {
      const r = upstreamResources[i];
      const b64 = (globalThis as unknown as { btoa?: (s: string) => string }).btoa?.(r.uri) ?? r.uri;
      const localUri = `upstream://${r.upstream}/${b64}`;
      bridgedResourceMap.set(localUri, { upstream: r.upstream, originalUri: r.uri, mimeType: r.mimeType, title: r.title });
      server.registerResource(
        `upstream-${r.upstream}-${i}`,
        localUri,
        { title: r.title ?? `Upstream ${r.upstream}`, description: `Bridged resource from upstream ${r.upstream}`, mimeType: r.mimeType },
        async (uri) => {
          const key = (uri as URL).href ?? String(uri);
          const meta = bridgedResourceMap.get(key);
          if (!meta) {
            return { contents: [{ uri: key, text: `Not found in bridge map: ${key}` }] };
          }
          const res = await readAggregatedResource(meta.upstream, meta.originalUri);
          const items = Array.isArray(res.contents) ? res.contents : [];
          // 直接透传上游内容；若无文本则输出 JSON 字符串
          const contents = items.length
            ? items.map((c) => ({ uri: c.uri, text: typeof c.text === "string" ? c.text : JSON.stringify(c) }))
            : [{ uri: key, text: `Empty content from upstream ${meta.upstream}` }];
          return { contents };
        }
      );
    }
  } catch (_) { /* ignore resource bridge errors on boot */ }

  server.registerResource(
    "config",
    "config://app",
    {
      title: "应用配置",
      description: "当前应用配置",
      mimeType: "application/json"
    },
    async (uri) => ({
      contents: [{ uri: uri.href, text: JSON.stringify(getConfigSync() ?? await loadConfig(), null, 2) }]
    })
  );

  server.registerResource(
    "greeting",
    new ResourceTemplate("greeting://{name}", { list: undefined }),
    { title: "问候", description: "动态问候资源" },
    (uri, { name }) => ({
      contents: [{ uri: uri.href, text: `Hello, ${name}!` }]
    })
  );

  server.registerResource(
    "file",
    new ResourceTemplate("filex://{path}", { list: undefined }),
    { title: "文件读取", description: "读取文件内容", mimeType: "text/plain" },
    async (uri, { path }) => ({
      contents: [{ uri: uri.href, text: await Deno.readTextFile(String(path)) }]
    })
  );

  for (const t of await getAllTools()) {
    server.registerTool(
      t.name,
      t.zodSchema
        ? { title: t.title, description: t.description, inputSchema: t.zodSchema }
        : { title: t.title, description: t.description },
      ((args: Record<string, unknown>) => t.handler(args).then((r) => ({ content: [{ type: "text", text: r.text }], isError: r.isError }))) as unknown as { (args: Record<string, unknown>): Promise<{ [x: string]: unknown; content: { [x: string]: unknown; type: "text"; text: string; }[]; isError?: boolean }>; }
    );
  }

  // 上游提示词桥接：将上游提示词注册为本地提示词，名称采用 namespace/name
  try {
    const prompts = await listAggregatedPrompts();
    const promptUpstreamMap = new Map<string, string>();
    for (const p of prompts) {
      const localName = `${p.namespace}/${p.name}`;
      promptUpstreamMap.set(localName, p.upstream);
      server.registerPrompt(
        localName,
        { title: p.name, description: p.description ?? `Upstream prompt from ${p.upstream}` },
        async (args, _extra) => {
          const up = promptUpstreamMap.get(localName);
          const res = up ? await getAggregatedPrompt(up, p.name, args as Record<string, unknown>) : { messages: [] };
          const raw = Array.isArray((res as { messages?: unknown[] }).messages) ? (res as { messages: unknown[] }).messages : [];
          type PromptMessage = { role: "user"|"assistant"; content: { type: "text"; text: string } };
          const norm: PromptMessage[] = raw.map((m) => {
            const r: "user"|"assistant" = (m as { role?: string }).role === "assistant" ? "assistant" : "user";
            const text = (() => {
              const content = (m as { content?: unknown }).content as { type?: string; text?: string } | undefined;
              if (content && content.type === "text" && typeof content.text === "string") return content.text;
              return JSON.stringify(m);
            })();
            return { role: r, content: { type: "text", text } } as const;
          });
          return { messages: norm } as unknown as { messages: PromptMessage[] };
        }
      );
    }
  } catch (_) { /* ignore prompt bridge errors on boot */ }

  server.registerPrompt(
    "review-code",
    { title: "代码审查", description: "简单代码审查", argsSchema: { code: z.string() } },
    ({ code }) => ({
      messages: [{ role: "user", content: { type: "text", text: `请审查以下代码:\n\n${code}` } }]
    })
  );

  return server;
} 
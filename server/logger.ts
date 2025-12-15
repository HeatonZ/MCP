import type { LogRecord, LogsSnapshot } from "@shared/types/log.ts";
import { getConfigSync, onConfigChange } from "@server/config.ts";
import { TIMEOUTS } from "@server/constants.ts";

let maxLogs = getConfigSync()?.logging?.maxLogs ?? 1000;
onConfigChange((cfg) => { maxLogs = cfg.logging?.maxLogs ?? maxLogs; });

const logs: LogRecord[] = [];

function push(item: LogRecord) {
  logs.push(item);
  if (logs.length > maxLogs) logs.shift();
  broadcast(item);
}

export function logDebug(source: string, message: string, data?: Record<string, unknown>) {
  push({ ts: Date.now(), level: "debug", source, message, data });
}
export function logInfo(source: string, message: string, data?: Record<string, unknown>) {
  push({ ts: Date.now(), level: "info", source, message, data });
}
export function logWarn(source: string, message: string, data?: Record<string, unknown>) {
  push({ ts: Date.now(), level: "warn", source, message, data });
}
export function logError(source: string, message: string, data?: Record<string, unknown>) {
  push({ ts: Date.now(), level: "error", source, message, data });
}

export function getSnapshot(): LogsSnapshot {
  return { items: [...logs] };
}

const encoder = new TextEncoder();
const clients = new Set<ReadableStreamDefaultController<Uint8Array>>();

function broadcast(item: LogRecord) {
  const line = encoder.encode(`data: ${JSON.stringify(item)}\n\n`);
  for (const c of clients) {
    try { c.enqueue(line); } catch (_) { /* ignore */ }
  }
}

export function createLogStream(signal: AbortSignal): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      clients.add(controller);
      controller.enqueue(encoder.encode(`: connected\n\n`));
      const ping = setInterval(() => {
        controller.enqueue(encoder.encode(`event: ping\n` + `data: {"ts":${Date.now()}}\n\n`));
      }, TIMEOUTS.HTTP_REQUEST);
      signal.addEventListener("abort", () => {
        clearInterval(ping);
        clients.delete(controller);
        try { controller.close(); } catch (_) {}
      });
    },
    cancel() {
      // noop; each controller is removed on abort above
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*",
    },
  });
} 
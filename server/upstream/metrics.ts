type UpstreamCounters = {
  name: string;
  transport: string;
  connected: boolean;
  connectedAt?: number;
  reconnects: number;
  lastError?: string;
  toolCount: number;
  resourceCount: number;
  promptCount: number;
  modelCount: number;
  avgLatencyMs: number;
};

const store = new Map<string, UpstreamCounters>();

export function initUpstreamMetrics(name: string, transport: string) {
  store.set(name, {
    name,
    transport,
    connected: false,
    reconnects: 0,
    toolCount: 0,
    resourceCount: 0,
    promptCount: 0,
    modelCount: 0,
    avgLatencyMs: 0,
  });
}

export function markConnected(name: string) {
  const m = store.get(name);
  if (!m) return;
  m.connected = true;
  m.connectedAt = Date.now();
  m.lastError = undefined;
}

export function markDisconnected(name: string, error?: string) {
  const m = store.get(name);
  if (!m) return;
  m.connected = false;
  m.lastError = error;
}

export function incReconnect(name: string) {
  const m = store.get(name);
  if (!m) return;
  m.reconnects += 1;
}

export function setCounts(name: string, counts: Partial<Pick<UpstreamCounters, "toolCount"|"resourceCount"|"promptCount"|"modelCount">>) {
  const m = store.get(name);
  if (!m) return;
  if (counts.toolCount !== undefined) m.toolCount = counts.toolCount;
  if (counts.resourceCount !== undefined) m.resourceCount = counts.resourceCount;
  if (counts.promptCount !== undefined) m.promptCount = counts.promptCount;
  if (counts.modelCount !== undefined) m.modelCount = counts.modelCount;
}

export function observeLatency(name: string, ms: number) {
  const m = store.get(name);
  if (!m) return;
  // simple exponential moving average
  const alpha = 0.2;
  m.avgLatencyMs = m.avgLatencyMs === 0 ? ms : (1 - alpha) * m.avgLatencyMs + alpha * ms;
}

export function getUpstreamStatus() {
  return Array.from(store.values());
}



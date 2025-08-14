let kvPromise: Promise<Deno.Kv> | null = null;
let kvInstance: Deno.Kv | null = null;

function toKeyParts(key: string): (string | number | Uint8Array)[] {
  return String(key).split(":");
}

export function getKv(): Promise<Deno.Kv> {
  if (!kvPromise) {
    kvPromise = (async () => {
      kvInstance = await Deno.openKv();
      return kvInstance;
    })();
  }
  return kvPromise;
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  const kv = await getKv();
  await kv.set(toKeyParts(key), value);
}

export async function kvGet<T = unknown>(key: string): Promise<T | null> {
  const kv = await getKv();
  const r = await kv.get<T>(toKeyParts(key));
  return r.value ?? null;
}

export async function kvList(prefix: string): Promise<Array<{ key: string; value: unknown }>> {
  const kv = await getKv();
  const out: Array<{ key: string; value: unknown }> = [];
  for await (const e of kv.list({ prefix: [String(prefix)] })) {
    out.push({ key: (e.key as (string | number | Uint8Array)[]).map(v => String(v)).join(":"), value: e.value });
  }
  return out;
}

// test-only
export async function __closeKvForTest(): Promise<void> {
  if (kvInstance) {
    try { kvInstance.close(); } catch (_) {}
  }
  kvInstance = null;
  kvPromise = null;
} 
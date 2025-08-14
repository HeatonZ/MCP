export function isHostAllowed(targetUrl: string, allowedHosts: readonly string[]): boolean {
	try {
		const u = new URL(targetUrl);
		return allowedHosts.length === 0 || allowedHosts.includes(u.hostname);
	} catch {
		return false;
	}
}

export async function fetchWithLimit(targetUrl: string, opts: { timeoutMs: number; maxBytes: number; headers?: HeadersInit }): Promise<{ ok: true; text: string } | { ok: false; error: string }>{
	const controller = new AbortController();
	const t = setTimeout(() => controller.abort(), Math.max(1, opts.timeoutMs || 0));
	try {
		const res = await fetch(targetUrl, { headers: opts.headers, signal: controller.signal });
		if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
		const reader = res.body?.getReader();
		if (!reader) return { ok: false, error: "No body" };
		let received = 0;
		const chunks: Uint8Array[] = [];
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			received += value.byteLength;
			if (received > opts.maxBytes) {
				return { ok: false, error: "Response too large" };
			}
			chunks.push(value);
		}
		const text = new TextDecoder().decode(concatChunks(chunks));
		return { ok: true, text };
	} catch (e) {
		return { ok: false, error: String(e) };
	} finally {
		clearTimeout(t);
	}
}

function concatChunks(chunks: Uint8Array[]): Uint8Array {
	let total = 0;
	for (const c of chunks) total += c.byteLength;
	const out = new Uint8Array(total);
	let off = 0;
	for (const c of chunks) { out.set(c, off); off += c.byteLength; }
	return out;
} 
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { kvGet, kvList, kvSet, __closeKvForTest } from "@server/kv.ts";

Deno.test("kv set/get/list with random prefix", async () => {
  const prefix = `test_${crypto.randomUUID()}`;
  await kvSet(`${prefix}:a`, { v: 1 });
  await kvSet(`${prefix}:b`, { v: 2 });

  const a = await kvGet<{ v: number }>(`${prefix}:a`);
  const b = await kvGet<{ v: number }>(`${prefix}:b`);
  assertEquals(a?.v, 1);
  assertEquals(b?.v, 2);

  const list = await kvList(prefix);
  const keys = list.map(e => e.key).sort();
  assertEquals(keys.includes(`${prefix}:a`), true);
  assertEquals(keys.includes(`${prefix}:b`), true);

  await __closeKvForTest();
}); 
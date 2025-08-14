import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { fsTools } from "@server/tools/fs.ts";

Deno.test("fs.file_read and file_write", async () => {
  const dir = await Deno.makeTempDir();
  const file = `${dir}/a.txt`;
  await Deno.writeTextFile(file, "hello");

  const readTool = fsTools.find(t => t.name === "file_read")!;
  const writeTool = fsTools.find(t => t.name === "file_write")!;

  const r1 = await readTool.handler({ path: file });
  assertEquals(r1.text, "hello");

  await writeTool.handler({ path: file, content: "world" });
  const text = await Deno.readTextFile(file);
  assertEquals(text, "world");
});

Deno.test("fs.file_list", async () => {
  const dir = await Deno.makeTempDir();
  await Deno.writeTextFile(`${dir}/x.txt`, "x");
  await Deno.writeTextFile(`${dir}/y.txt`, "y");
  const listTool = fsTools.find(t => t.name === "file_list")!;
  const r = await listTool.handler({ dir });
  assertStringIncludes(r.text, "x.txt");
  assertStringIncludes(r.text, "y.txt");
}); 
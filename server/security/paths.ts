import { join, normalize, fromFileUrl } from "@std/path";

function projectRoot(): string {
  const here = new URL("../", import.meta.url);
  const root = new URL("../../", here);
  return fromFileUrl(root);
}

export function safeResolve(relativePath: string, allowedDirs: readonly string[]): { ok: true; path: string } | { ok: false; message: string } {
  const root = projectRoot();
  const normalized = normalize(relativePath).replaceAll("\\", "/");
  const top = normalized.split("/")[0];
  if (!allowedDirs.includes(top)) {
    return { ok: false, message: "Path outside of allowed dirs" };
  }
  const abs = normalize(join(root, normalized));
  if (!abs.startsWith(normalize(join(root, top)))) {
    return { ok: false, message: "Path traversal blocked" };
  }
  return { ok: true, path: abs };
}

export async function listFilesRecursive(dir: string, allowedDirs: readonly string[]): Promise<string[]> {
  const result: string[] = [];
  const target = safeResolve(dir, allowedDirs);
  if (!target.ok) return result;
  const base = target.path;
  for await (const entry of Deno.readDir(base)) {
    const rel = `${dir}/${entry.name}`.replaceAll("\\", "/");
    if (entry.isDirectory) {
      const sub = await listFilesRecursive(rel, allowedDirs);
      result.push(...sub);
    } else if (entry.isFile) {
      result.push(rel);
    }
  }
  return result;
} 
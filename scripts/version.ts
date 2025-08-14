type SemVer = { major: number; minor: number; patch: number };

function parse(v: string): SemVer {
  const m = v.trim().match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!m) throw new Error(`Invalid version: ${v}`);
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

function toString(s: SemVer): string {
  return `${s.major}.${s.minor}.${s.patch}`;
}

function bump(s: SemVer, kind: "major"|"minor"|"patch"): SemVer {
  if (kind === "major") return { major: s.major + 1, minor: 0, patch: 0 };
  if (kind === "minor") return { major: s.major, minor: s.minor + 1, patch: 0 };
  return { major: s.major, minor: s.minor, patch: s.patch + 1 };
}

async function readJson(url: URL) {
  const text = await Deno.readTextFile(url);
  return JSON.parse(text);
}
async function writeJson(url: URL, obj: unknown) {
  const text = JSON.stringify(obj, null, 2);
  await Deno.writeTextFile(url, text + "\n");
}

const root = new URL("../", import.meta.url);
const versionFile = new URL("./version.json", root);
const configFile = new URL("./config/config.json", root);
const frontendPkg = new URL("./frontend/package.json", root);

async function syncTo(version: string) {
  // version.json
  await writeJson(versionFile, { version });
  // config/config.json
  const cfg = await readJson(configFile);
  cfg.version = version;
  await writeJson(configFile, cfg);
  // frontend/package.json
  const pkg = await readJson(frontendPkg);
  pkg.version = version;
  await writeJson(frontendPkg, pkg);
}

async function main() {
  const [cmd, arg] = Deno.args;
  if (!cmd) {
    console.log("Usage: deno run -A scripts/version.ts <set|bump> <version|major|minor|patch>");
    Deno.exit(1);
  }
  if (cmd === "set") {
    if (!arg) throw new Error("Missing version");
    const p = parse(arg);
    await syncTo(toString(p));
    console.log(`version set to ${toString(p)}`);
    return;
  }
  if (cmd === "bump") {
    const current = await readJson(versionFile);
    const s = parse(current.version);
    const kind = (arg ?? "patch") as "major"|"minor"|"patch";
    const next = bump(s, kind);
    await syncTo(toString(next));
    console.log(`version bumped to ${toString(next)}`);
    return;
  }
  throw new Error(`Unknown command: ${cmd}`);
}

await main(); 
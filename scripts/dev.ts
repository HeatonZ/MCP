/// <reference lib="deno.unstable" />

const root = new URL("../", import.meta.url);

async function execCapture(cmd: string, args: string[], cwd: URL): Promise<{ success: boolean; stdout: string; stderr: string }>{
  try {
    const p = new Deno.Command(cmd, { cwd, args, stdout: "piped", stderr: "piped" });
    const { code, stdout, stderr } = await p.output();
    return { success: code === 0, stdout: new TextDecoder().decode(stdout), stderr: new TextDecoder().decode(stderr) };
  } catch (e) {
    return { success: false, stdout: "", stderr: String(e) };
  }
}

async function ensureNode20OrExit() {
  const here = new URL("./", root);
  const v = await execCapture("node", ["-v"], here);
  let major = 0;
  if (v.success) {
    const m = v.stdout.trim().match(/^v?(\d+)\./);
    major = m ? Number(m[1]) : 0;
  }
  if (major >= 20) return;

  console.log("[check] 检测到 Node 版本 < 20，尝试自动切换...");

  if (Deno.build.os === "windows") {
    // 尝试使用 nvm for Windows 切换
    const nvmCheck = await execCapture("nvm", ["list"], here);
    if (!nvmCheck.success) {
      console.error("[check] 未检测到 nvm (Windows)。请安装 Node >= 20 或安装 nvm 后重试。");
      Deno.exit(1);
    }
    await execCapture("nvm", ["install", "20"], here);
    const useRes = await execCapture("nvm", ["use", "20"], here);
    if (!useRes.success) {
      console.error("[check] nvm 切换 Node 20 失败，请手动执行: nvm install 20 && nvm use 20");
      Deno.exit(1);
    }
    const re = await execCapture("node", ["-v"], here);
    const mm = re.stdout.trim().match(/^v?(\d+)\./);
    const mj = mm ? Number(mm[1]) : 0;
    if (mj < 20) {
      console.error("[check] 切换后仍非 Node >= 20，请手动检查 nvm 配置。");
      Deno.exit(1);
    }
    console.log(`[check] 已切换到 Node ${re.stdout.trim()}`);
    return;
  }

  // 其他平台：提示手动切换（nvm 在 shell 中是函数，无法直接在此进程调用）
  console.error("[check] 请使用 nvm 将 Node 切换到 >= 20 后重试。例如：nvm install 20 && nvm use 20");
  Deno.exit(1);
}

await ensureNode20OrExit();

const p1 = new Deno.Command("deno", {
  cwd: new URL("./", root),
  args: ["task", "dev:server"],
  stdout: "piped",
  stderr: "piped",
});

const pnpmBin = Deno.build.os === "windows" ? "pnpm.cmd" : "pnpm";

// ensure frontend deps installed
{
  const install = new Deno.Command(pnpmBin, {
    cwd: new URL("./frontend", root),
    args: ["install"],
    stdout: "piped",
    stderr: "piped",
  });
  const s = install.spawn();
  const status = await s.status;
  if (!status.success) {
    const out = await new Response(s.stderr).text();
    console.error("[frontend] pnpm install 失败:\n" + out);
    Deno.exit(1);
  }
}

const p2 = new Deno.Command(pnpmBin, {
  cwd: new URL("./frontend", root),
  args: ["run", "dev"],
  stdout: "piped",
  stderr: "piped",
});

const s1 = p1.spawn();
const s2 = p2.spawn();

function pipe(prefix: string, stream: ReadableStream<Uint8Array>) {
  (async () => {
    for await (const chunk of stream) {
      const text = new TextDecoder().decode(chunk);
      for (const line of text.split(/\r?\n/)) {
        if (line.trim().length === 0) continue;
        console.log(`[${prefix}] ${line}`);
      }
    }
  })();
}

pipe("server", s1.stdout);
pipe("server!", s1.stderr);
pipe("frontend", s2.stdout);
pipe("frontend!", s2.stderr);

console.log("Dev started: server http://localhost:8787, frontend http://localhost:5173");

await Promise.race([s1.status, s2.status]); 
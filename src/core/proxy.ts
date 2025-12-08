import { file } from "bun";
import { write as bunWrite } from "bun";
import { mkdir, readdir, chmod } from "node:fs/promises"; //https://bun.com/docs/runtime/file-io#directories
import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import net from "node:net";
import cliProgress from "cli-progress";
import { error, warn, info, reset } from "@lib/constants";

const API_BASE = "https://duelsplus.com/api/releases";
let proxyProc: any = null;
let isProxyRunning = false;

export const proxyEmitter = new EventEmitter();

export function getProxyStatus() {
  return isProxyRunning;
}

function getPlatform() {
  const p = os.platform();
  if (p === "win32") return "win-x64";
  if (p === "darwin") return "macos-x64";
  if (p === "linux") return "linux-x64";
  throw new Error("Unsupported platform");
}

function getInstallDir() {
  return path.join(os.homedir(), ".duelsplus", "proxy");
}

export async function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once("error", (err: any) => {
      if (err.code === "EADDRINUSE") {
        resolve(false); // port is in use
      } else {
        resolve(false); // treat other errors as "not free"
      }
    });

    server.once("listening", () => {
      server.close(() => resolve(true)); // port is free
    });

    server.listen(port, "127.0.0.1");
  });
}

//download using streaming writer so we can report progress without pulling
//the whole file into memory.
async function downloadArtifact(
  assetId: string,
  destPath: string,
  emit?: (ev: string, payload?: any) => void,
) {
  const url = `${API_BASE}/artifact?assetId=${encodeURIComponent(assetId)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download artifact: ${res.status}`);

  await mkdir(path.dirname(destPath), { recursive: true }).catch(() => {});
  //create filesink
  const sink = file(destPath);
  const writer = sink.writer();
  const reader = res.body?.getReader();
  if (!reader) {
    //write full response as fallback
    const arr = new Uint8Array(await res.arrayBuffer());
    await bunWrite(destPath, arr);
    if (os.platform() !== "win32") await chmod(destPath, 0o755);
    return;
  }

  const total = Number(res.headers.get("Content-Length") ?? NaN); //api may not always return content-length
  const bar = new cliProgress.SingleBar(
    {
      format:
        "Downloading [{bar}] {percentage}% | {downloadedMB}/{totalMB} MB ({speed} MB/s)",
      hideCursor: true,
      barsize: 30,
    },
    cliProgress.Presets.shades_classic,
  );

  bar.start(total, 0, {
    downloadedMB: "0.0",
    totalMB: (total / 1024 / 1024).toFixed(1),
    speed: "0.0",
  });

  let downloaded = 0;
  const start = Date.now();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      //value is Uint8Array
      await writer.write(value);
      downloaded += value?.length ?? 0;

      const elapsed = (Date.now() - start) / 1000;
      const speed = (
        downloaded /
        1024 /
        1024 /
        Math.max(elapsed, 0.01)
      ).toFixed(1);

      bar.update(downloaded, {
        downloadedMB: (downloaded / 1024 / 1024).toFixed(1),
        speed,
      });

      emit?.("progress", {
        downloaded,
        total: Number.isFinite(total) ? total : undefined,
        speed,
      });
    }
  } finally {
    writer.end();
    bar.stop();
  }

  //chmod for posix
  if (os.platform() !== "win32") {
    try {
      await chmod(destPath, 0o755);
    } catch {
      //ignore
    }
  }
}

export async function checkForUpdates(
  emit?: (ev: string, payload?: any) => void,
) {
  const installDir = getInstallDir();
  await mkdir(installDir, { recursive: true }).catch(() => {});
  //emit?.("log", `Proxy directory: ${installDir}`);
  console.info(`${info}Proxy directory: ${installDir}${reset}`);

  const releasesRes = await fetch(API_BASE);
  if (!releasesRes.ok)
    throw new Error(`Failed to fetch releases: ${releasesRes.status}`);
  const releases = await releasesRes.json();

  const latest = (releases as any[]).find((r) => r.isLatest);
  if (!latest) throw new Error("No latest release found");

  const platformTag = getPlatform();
  const asset = latest.assets?.find((a: any) => a.name.includes(platformTag));
  if (!asset) throw new Error(`No asset for platform ${platformTag}`);

  const filePath = path.join(installDir, asset.name);
  //todo: return checksums in api and compare with downloaded filePath
  //instead of assuming based on filesize
  const exists = await file(filePath).exists();
  let needsDownload = !exists;
  if (exists) {
    try {
      const stats = fs.statSync(filePath);
      const sizeMB = stats.size / (1024 * 1024);
      if (sizeMB < 50) {
        emit?.("log", `Cached download may be corrupt. Redownloading...`);
        needsDownload = true;
      }
    } catch {
      needsDownload = true;
    }
  }

  if (needsDownload) {
    emit?.("status", { status: "Downloading proxy", version: latest.version });
    await downloadArtifact(asset.id, filePath, emit);
  }

  return filePath;
}

export async function launchProxy(
  port = 25565,
  emit?: (ev: string, payload?: any) => void,
) {
  const free = await isPortFree(port);
  if (!free) {
    throw new Error(
      `Port ${port} is already in use. Please specify a different port by passing --port <1-65535>`,
    );
  }

  const proxyPath = await checkForUpdates(emit);
  //might need to use .exe
  if (!fs.existsSync(proxyPath))
    throw new Error(`Proxy not found at ${proxyPath}`);

  const proc = Bun.spawn([proxyPath, "--port", String(port)], {
    cwd: path.dirname(proxyPath),
    stdout: "pipe",
    stderr: "pipe",
    detached: false,
  });

  proxyProc = proc;
  isProxyRunning = true;

  //log stdout
  (async () => {
    try {
      for await (const chunk of proc.stdout as any) {
        const text = new TextDecoder().decode(chunk).trim();
        if (
          !text.includes("[launcher:ign]") &&
          !text.includes("[launcher:uuid]")
        ) {
          emit?.("log", text);
        }
      }
    } catch (err) {
      //ignore
    }
  })();

  //log stderr
  (async () => {
    try {
      for await (const chunk of proc.stderr as any) {
        emit?.("log", new TextDecoder().decode(chunk).trim());
      }
    } catch (err) {
      //ignore
    }
  })();

  //handle exit
  (async () => {
    try {
      const code = await proc.exited;
      isProxyRunning = false;

      if (code !== 0) {
        proxyEmitter.emit(
          "crash",
          `Proxy process exited with a non-zero exit code: ${code}`,
        );
      }
    } catch (err: any) {
      isProxyRunning = false;
      proxyEmitter.emit("crash", err?.stack);
    }
  })();
}

export function killProxy() {
  if (proxyProc) {
    try {
      proxyProc.kill("SIGINT");
    } catch {
      try {
        proxyProc.kill("SIGTERM");
      } catch {
        //best-effort
      }
    }
    proxyProc = null;
    isProxyRunning = false;
  }
}

export async function waitForProxyToStop() {
  return new Promise<void>((resolve) => {
    const interval = setInterval(() => {
      if (!getProxyStatus()) {
        clearInterval(interval);
        resolve();
      }
    }, 100);
  });
}

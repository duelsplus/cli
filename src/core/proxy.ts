import { file } from "bun";
import { write as bunWrite } from "bun";
import { readdir, chmod } from "node:fs/promises";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import net from "node:net";
import cliProgress from "cli-progress";
import { runtimeState } from "@/lib/state";
import { error, warn, info, reset } from "@lib/constants";
import { ensureDir } from "@lib/files";
import { getProxyInstallDir } from "@lib/paths";

const API_BASE = "https://duelsplus.com/api/releases";
let proxyProc: any = null;
let proxyPath: string | null = null; // Cache the proxy path
let isProxyRunning = false;
let isIntentionalShutdown = false;
let isAttachedToExisting = false;
let attachedPid: number | null = null;
let attachedPort: number | null = null;

export const proxyEmitter = new EventEmitter();

export function getProxyStatus() {
  return isProxyRunning;
}

function getPidFilePath() {
  return path.join(getInstallDir(), "proxy.lock");
}

interface PidFileData {
  pid: number;
  port: number;
}

async function savePidFile(pid: number, port: number) {
  const pidFilePath = getPidFilePath();
  const data: PidFileData = { pid, port };
  await mkdir(path.dirname(pidFilePath), { recursive: true }).catch(() => {});
  await Bun.write(pidFilePath, JSON.stringify(data));
}

async function readPidFile(): Promise<PidFileData | null> {
  const pidFilePath = getPidFilePath();
  if (!fs.existsSync(pidFilePath)) {
    return null;
  }
  try {
    const content = await Bun.file(pidFilePath).text();
  //might need to use .exe
    return JSON.parse(content) as PidFileData;
  } catch {
    return null;
  }
}

async function deletePidFile() {
  const pidFilePath = getPidFilePath();
  if (fs.existsSync(pidFilePath)) {
    try {
      fs.unlinkSync(pidFilePath);
    } catch {
      //ignore
    }
  }
}

function isProcessRunning(pid: number): boolean {
  try {
    // Signal 0 doesn't actually send a signal, just checks if process exists
    // trust
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function checkForExistingProxy(port: number): Promise<{ pid: number; port: number } | null> {
  // Check PID file first
  const pidData = await readPidFile();
  if (!pidData) {
    // No PID file, no existing proxy we know about
    return null;
  }

  // Check if the PID file matches the port
  if (pidData.port !== port) {
    // PID file is for a different port
    await deletePidFile();
    return null;
  }

  // Check if the process is still running
  if (!isProcessRunning(pidData.pid)) {
    // Process is dead, clean up PID file
    await deletePidFile();
    return null;
  }

  // Process is running and matches our port
  return pidData;
}

function getPlatform() {
  const p = os.platform();
  if (p === "win32") return "win-x64";
  if (p === "darwin") return "macos-x64";
  if (p === "linux") return "linux-x64";
  throw new Error("Unsupported platform");
}

function getInstallDir() {
  return getProxyInstallDir();
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
  const url = `${API_BASE}/signed?assetId=${encodeURIComponent(assetId)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download artifact: ${res.status}`);

  await ensureDir(path.dirname(destPath));

  if (fs.existsSync(destPath)) {
    try {
      fs.unlinkSync(destPath);
    } catch (err) {
      console.warn(
        `${warn}Failed to delete cached proxy install.`,
      );
    }
  }
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
  silent = false,
) {
  if (runtimeState.proxyPath) {
    const absolutePath = path.resolve(runtimeState.proxyPath);
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`Custom proxy binary not found at: ${absolutePath}`);
    }
    if (!silent) {
      console.info(`${info}Using custom proxy: ${absolutePath}${reset}`);
    }
    return absolutePath;
  }

  const installDir = getInstallDir();
  await ensureDir(installDir);
  if (!silent) {
    console.info(`${info}Proxy directory: ${installDir}${reset}`);
  }

  const releasesRes = await fetch(API_BASE);
  if (!releasesRes.ok)
    throw new Error(`Failed to fetch releases: ${releasesRes.status}`);
  const releases = await releasesRes.json();

  const latest = (releases as any[]).find((r) => r.isLatest);
  if (!latest) throw new Error("No latest release found");

  const platformTag = getPlatform();
  const asset = latest.assets?.find((a: any) => a.name.includes(platformTag));
  if (!asset) throw new Error(`No asset for platform ${platformTag}`);

  if (runtimeState.noUpdate) {
    const files = await readdir(installDir).catch(() => []);
    const cached = files.find((f) => f.includes(platformTag));
    if (!cached) {
      throw new Error(
        "No cached proxy install is available and updates are disabled. Cannot proceed.",
      );
    }
    return path.join(installDir, cached);
  }

  const filePath = path.join(installDir, asset.name);
  //todo: return checksums in api and compare with downloaded filePath
  //instead of assuming based on filesize
  const exists = await file(filePath).exists();
  let needsDownload = !exists;
  if (runtimeState.forceUpdate) {
    needsDownload = true;
  }
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

  const currentProxyPath = await checkForUpdates(emit);
  proxyPath = currentProxyPath; // Cache for later use
  if (!fs.existsSync(currentProxyPath))
    throw new Error(`Proxy not found at ${currentProxyPath}`);

  // Always spawn detached so the process can detach
  const proc = Bun.spawn([currentProxyPath, "--port", String(port)], {
    cwd: path.dirname(proxyPath),
    stdout: "pipe",
    stderr: "pipe",
    detached: true,
  });

  proxyProc = proc;
  isProxyRunning = true;
  isIntentionalShutdown = false;
  isAttachedToExisting = false;
  attachedPid = null;
  attachedPort = null;

  //log stdout
  (async () => {
    try {
      for await (const chunk of proc.stdout as any) {
        if (isIntentionalShutdown)
          continue;

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
        if (isIntentionalShutdown)
          continue;

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
      await deletePidFile();

      // Only emit crash if it wasn't an intentional shutdown
      if (code !== 0 && !isIntentionalShutdown) {
        proxyEmitter.emit(
          "crash",
          `Proxy process exited with a non-zero exit code: ${code}`,
        );
      }
    } catch (err: any) {
      isProxyRunning = false;
      await deletePidFile();
      if (!isIntentionalShutdown) {
        proxyEmitter.emit("crash", err?.stack);
      }
    }
  })();
}

export async function attachToExistingProxy(pid: number, port: number, emit?: (ev: string, payload?: any) => void) {
  if (!isProcessRunning(pid)) {
    await deletePidFile();
    throw new Error(`Proxy process ${pid} is not running`);
  }

  isProxyRunning = true;
  isAttachedToExisting = true;
  attachedPid = pid;
  attachedPort = port;
  proxyProc = null; // We don't have a process object for attached processes, we gotta fix that soon

  (async () => {
    const checkInterval = setInterval(() => {
      if (isAttachedToExisting && attachedPid !== null) {
        if (!isProcessRunning(attachedPid)) {
          // Process died (rip)
          isProxyRunning = false;
          isAttachedToExisting = false;
          attachedPid = null;
          attachedPort = null;
          clearInterval(checkInterval);
          deletePidFile();
          proxyEmitter.emit("crash", `Attached proxy process ${pid} has exited`);
        }
      } else {
        clearInterval(checkInterval);
      }
    }, 1000);
  })();
}

export function killProxy() {
  if (isAttachedToExisting && attachedPid !== null) {
    // Kill the attached process by PID
    isIntentionalShutdown = true;
    try {
      if (os.platform() === "win32") {
        process.kill(attachedPid);
      } else {
        process.kill(attachedPid, "SIGTERM");
      }
    } catch {
      try {
        process.kill(attachedPid);
      } catch {
        //best-effort
      }
    }
    isProxyRunning = false;
    isAttachedToExisting = false;
    attachedPid = null;
    attachedPort = null;
    deletePidFile();
    return;
  }

  if (proxyProc) {
    isIntentionalShutdown = true;
    try {
      if (os.platform() === "win32") {
        // Windows doesn't support SIGINT/SIGTERM properly, use kill() without signal
        proxyProc.kill();
      } else {
        // SIGTERM instead of SIGINT because pkg config doesnt work
        proxyProc.kill("SIGTERM");
      }
    } catch {
      try {
        proxyProc.kill();
      } catch {
        //best-effort
      }
    }
    deletePidFile();
  }
}

export async function detachProxy(port: number) {
  if (!isProxyRunning) {
    throw new Error("No proxy process to detach");
  }

  if (isAttachedToExisting && attachedPid !== null) {
    // Already attached to a detached process
    // Save PID and dip
    await savePidFile(attachedPid, port);
    isProxyRunning = false;
    isAttachedToExisting = false;
    attachedPid = null;
    attachedPort = null;
    return;
  }

  if (!proxyProc) {
    throw new Error("No proxy process to detach");
  }

  // Save PID file and unref
  const pid = proxyProc.pid;
  if (pid) {
    await savePidFile(pid, port);
    proxyProc.unref();
  }

  // Clear our stateeeee
  proxyProc = null;
  isProxyRunning = false;
}

export async function waitForProxyToStop() {
  if (isAttachedToExisting && attachedPid !== null) {
    // Poll to check if the attached process has stopped
    return new Promise<void>((resolve) => {
      const interval = setInterval(() => {
        if (!isProcessRunning(attachedPid!)) {
          isProxyRunning = false;
          clearInterval(interval);
          resolve();
        }
      }, 100);
    });
  }

  if (proxyProc) {
    try {
      await proxyProc.exited;
    } catch (error) {
      // the process here should have already exited
      // no need to forward the error
    }
  }

  // gotta double check, so we poll babyyy
  return new Promise<void>((resolve) => {
    if (!getProxyStatus()) {
      resolve();
    }

    const interval = setInterval(() => {
      if (!getProxyStatus()) {
        clearInterval(interval);
        resolve();
      }
    }, 100);
  });
}

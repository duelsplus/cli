import { file } from "bun";
import { write as bunWrite } from "bun";
import { readdir, chmod, mkdir } from "node:fs/promises";
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

const API_BASE = "https://proxy-updates.duelsplus.com/v1/releases";
const API_BASE_BETA = "https://proxy-updates.duelsplus.com/v1/releases/beta";
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
  controlPort?: number;
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

// Read the proxy's lock file (different from CLI's PID file)
// The proxy writes this file with control port info for graceful shutdown
function getProxyLockFilePath() {
  return path.join(os.homedir(), ".duelsplus", "proxy.lock");
}

async function readProxyLockFile(): Promise<PidFileData | null> {
  const lockFilePath = getProxyLockFilePath();
  if (!fs.existsSync(lockFilePath)) {
    return null;
  }
  try {
    const content = await Bun.file(lockFilePath).text();
    return JSON.parse(content) as PidFileData;
  } catch {
    return null;
  }
}

// Send shutdown command via TCP control socket
// Returns true if shutdown was acknowledged, false otherwise
async function sendShutdownCommand(controlPort: number, timeout = 5000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const timer = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, timeout);

    socket.connect(controlPort, "127.0.0.1", () => {
      socket.write("shutdown");
    });

    socket.on("data", (data) => {
      clearTimeout(timer);
      if (data.toString().trim() === "ok") {
        socket.destroy();
        resolve(true);
      }
    });

    socket.on("error", () => {
      clearTimeout(timer);
      resolve(false);
    });

    socket.on("close", () => {
      clearTimeout(timer);
    });
  });
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

// The proxy filename encodes everything we need:
//   duelsplus-1.8.0-beta-node18-win-x64.exe   -> version "1.8.0", beta = true
//   duelsplus-1.8.0-node18-win-x64.exe        -> version "1.8.0", beta = false

interface InstalledProxyInfo {
  fileName: string;
  version: string;
  isBeta: boolean;
}

/**
 * Parse version and beta flag out of a proxy filename.
 * Expected pattern: duelsplus-{version}[-beta]-node18-{platform}.exe
 */
function parseProxyFilename(fileName: string): { version: string; isBeta: boolean } | null {
  // Match: duelsplus-<version>-beta-node or duelsplus-<version>-node
  const match = fileName.match(/^duelsplus-(\d+\.\d+\.\d+)(-beta)?-node/);
  if (!match) return null;
  return {
    version: match[1],
    isBeta: match[2] === "-beta",
  };
}

/**
 * Scan the install directory and return info about whatever proxy binary is
 * currently downloaded.  Returns `null` if nothing is installed.
 */
async function getInstalledProxy(): Promise<InstalledProxyInfo | null> {
  const installDir = getInstallDir();
  const platformTag = getPlatform();

  let files: string[];
  try {
    files = await readdir(installDir);
  } catch {
    return null;
  }

  for (const f of files) {
    if (!f.includes(platformTag)) continue;
    const parsed = parseProxyFilename(f);
    if (parsed) {
      return { fileName: f, ...parsed };
    }
  }
  return null;
}

/**
 * Delete all proxy binaries in the install directory except `keep`.
 * Pass `null` to delete everything (full purge).
 */
export async function cleanupProxyBinaries(keep: string | null = null) {
  const installDir = getInstallDir();
  const platformTag = getPlatform();

  try {
    const files = await readdir(installDir);
    for (const f of files) {
      if (keep && f === keep) continue;
      if (f.includes(platformTag)) {
        try { fs.unlinkSync(path.join(installDir, f)); } catch { /* best-effort */ }
      }
    }
  } catch { /* ignore */ }
}

/**
 * Returns `true` when the installed proxy is a beta build but the user is
 * not (or is no longer) eligible for beta.  Callers should purge the proxy
 * and re-download stable.
 */
export async function isInstalledProxyBetaAndShouldNotBe(
  userIsBetaEligible: boolean,
  receiveBetaReleases: boolean,
): Promise<boolean> {
  const installed = await getInstalledProxy();
  if (!installed) return false; // nothing installed

  // Installed build is beta, but user lost eligibility or turned beta off
  if (installed.isBeta && (!userIsBetaEligible || !receiveBetaReleases)) {
    return true;
  }
  return false;
}

/**
 * Returns `true` when the installed proxy version/track differs from the
 * latest release the user is supposed to have (stable or beta).
 */
export async function isProxyVersionStale(
  useBeta: boolean,
): Promise<{ stale: boolean; reason?: string }> {
  const installed = await getInstalledProxy();
  if (!installed) return { stale: false }; // nothing installed — download will handle it

  const url = useBeta ? API_BASE_BETA : API_BASE;
  const res = await fetch(url);
  if (!res.ok) return { stale: false }; // can't reach API, let normal flow handle it
  const releases = (await res.json()) as any[];
  const latest =
    releases.find((r: any) => r.isLatest) ?? releases[0];
  if (!latest) return { stale: false };

  if (installed.version !== latest.version) {
    return {
      stale: true,
      reason: `Installed ${installed.version} (${installed.isBeta ? "beta" : "stable"}) but latest is ${latest.version}`,
    };
  }

  // Version matches but track changed (e.g. had beta, now should use stable)
  if (installed.isBeta !== useBeta) {
    return {
      stale: true,
      reason: `Installed track is ${installed.isBeta ? "beta" : "stable"} but should be ${useBeta ? "beta" : "stable"}`,
    };
  }

  return { stale: false };
}

export async function checkForUpdates(
  emit?: (ev: string, payload?: any) => void,
  silent = false,
  useBeta = false,
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

  if (useBeta && !silent) {
    console.info(`${info}Beta releases enabled${reset}`);
  }

  const url = useBeta ? API_BASE_BETA : API_BASE;
  const releasesRes = await fetch(url);
  if (!releasesRes.ok)
    throw new Error(`Failed to fetch releases: ${releasesRes.status}`);
  const releases = await releasesRes.json();

  // Prefer isLatest, fall back to first (newest) entry
  const latest =
    (releases as any[]).find((r) => r.isLatest) ?? (releases as any[])[0];
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

  // Determine whether a download is needed
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

  // Also check if the installed filename doesn't match the expected asset
  if (!needsDownload) {
    const installed = await getInstalledProxy();
    if (installed && installed.fileName !== asset.name) {
      if (!silent) {
        console.info(
          `${info}Installed ${installed.fileName} differs from expected ${asset.name}. Updating...${reset}`,
        );
      }
      needsDownload = true;
    }
  }

  if (needsDownload) {
    emit?.("status", { status: "Downloading proxy", version: latest.version });
    await downloadArtifact(asset.id, filePath, emit);
  }

  // Delete every other proxy binary, keep only the one we just ensured
  await cleanupProxyBinaries(asset.name);

  return filePath;
}

export async function launchProxy(
  port = 25565,
  emit?: (ev: string, payload?: any) => void,
  useBeta = false,
) {
  const free = await isPortFree(port);
  if (!free) {
    throw new Error(
      `Port ${port} is already in use. Please specify a different port by passing --port <1-65535>`,
    );
  }

  const currentProxyPath = await checkForUpdates(emit, false, useBeta);
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

export async function killProxy() {
  isIntentionalShutdown = true;

  // Try graceful shutdown via control socket first
  // This works on all platforms including Windows
  const lockData = await readProxyLockFile();
  if (lockData?.controlPort) {
    const success = await sendShutdownCommand(lockData.controlPort);
    if (success) {
      // Graceful shutdown initiated - don't clear proxyProc yet
      // Let waitForProxyToStop() handle waiting for actual exit
      // so that stdout logs can be read before the process terminates
      isAttachedToExisting = false;
      attachedPid = null;
      attachedPort = null;
      return;
    }
  }

  // Fallback to forceful kill if control socket fails
  if (isAttachedToExisting && attachedPid !== null) {
    // Kill the attached process by PID
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
    isProxyRunning = false;
    proxyProc = null;
    return;
  }

  // No proxyProc - check if there's a PID in the lock file to wait for
  const lockData = await readProxyLockFile();
  if (lockData?.pid) {
    return new Promise<void>((resolve) => {
      const interval = setInterval(() => {
        if (!isProcessRunning(lockData.pid)) {
          isProxyRunning = false;
          clearInterval(interval);
          resolve();
        }
      }, 100);
    });
  }

  // No process to wait for
  isProxyRunning = false;
}

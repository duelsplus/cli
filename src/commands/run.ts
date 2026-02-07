import {
  error,
  warn,
  info,
  reset,
  prompt,
  brand,
} from "@lib/constants";
import { tokenExists, getToken, saveToken, verifyToken } from "@core/auth";
import { handleStats } from "@cmd/stats";
import { handleSettings } from "@cmd/settings";
import { handleHelp } from "@cmd/help";
import { handleStatus } from "@cmd/status";
import { handleUpdate } from "@cmd/update";
import { handleDetach } from "@cmd/detach";
import { handleStop } from "@cmd/stop";
import { handleClear } from "@cmd/clear";
import {
  proxyEmitter,
  launchProxy,
  killProxy,
  checkForExistingProxy,
  attachToExistingProxy,
  isInstalledProxyBetaAndShouldNotBe,
  cleanupProxyBinaries,
  isProxyVersionStale,
} from "@core/proxy";
import { fetchUser, isBetaEligible } from "@core/entitlements";
import { getConfig, setConfig } from "@core/settings";
import { password } from "@inquirer/prompts";
import * as readline from "node:readline";
import { completer } from "@lib/completer";
import { getHistoryPath } from "@lib/paths";
import { readTextFile, writeTextFile, ensureDir } from "@lib/files";

async function promptToken(): Promise<string> {
  while (true) {
    const token = await password({
      message: "Enter your verification token:",
      mask: "*",
      async validate(value: string) {
        if (value.trim().length === 0)
          return "Invalid token";

        const verify = await verifyToken(value);
        if (!verify.success) {
          if (verify.code === "banned") {
            console.error(
              `${error}This account has been banned for breaching the Terms of Service.${reset}`,
            );
            console.log(
              `${warn}Appeal this decision:${reset} ${info}https://discord.gg/YD4JZnuGYv${reset}\n`,
            );
            await new Promise(() => {}); //hang forever
          }
          return "Invalid token";
        }
        return true;
      },
    });

    if (typeof token === "string") {
      await saveToken(token);
      return token;
    }
  }
}


async function loadHistory(): Promise<string[]> {
  const historyPath = getHistoryPath();
  const content = await readTextFile(historyPath);
  if (content) {
    return content.split("\n").filter((line) => line.trim().length > 0);
  }
  return [];
}

async function saveHistory(history: string[]): Promise<void> {
  const historyPath = getHistoryPath();
  try {
    // Keep last 1000 entries
    const recentHistory = history.slice(-1000);
    await writeTextFile(historyPath, recentHistory.join("\n"));
  } catch {
    // Ignore errors
  }
}

async function startInteractivePrompt(port: number) {
  // Load history
  const savedHistory = await loadHistory();
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    completer: (line: string) => {
      return completer(line);
    },
    historySize: 1000,
  });

  // Restore history (readline automatically manages history, we just need to populate it)
  // Note: readline's history is read-only, so we'll track it separately for saving
  const commandHistory: string[] = [...savedHistory];

  let isDetaching = false;

  const promptUser = () => {
    rl.question(prompt, async (input) => {
      const trimmedInput = input.trim();
      
      // Track history for saving (limit to 1000 entries)
      if (trimmedInput) {
        // Remove if already exists to avoid duplicates
        const index = commandHistory.indexOf(trimmedInput);
        if (index !== -1) {
          commandHistory.splice(index, 1);
        }
        commandHistory.push(trimmedInput);
        // Keep only last 1000 entries
        if (commandHistory.length > 1000) {
          commandHistory.shift();
        }
      }
      
      const parts = trimmedInput.split(/\s+/);
      const command = parts[0]?.toLowerCase() || "";
      const subcommand = parts[1];
      const arg1 = parts[2];
      const arg2 = parts[3];

      switch (command) {
        case "help":
        case "?":
          handleHelp();
          break;
        case "status":
          handleStatus(port);
          break;
        case "update":
          await handleUpdate();
          break;
        case "detach":
          isDetaching = true;
          const detached = await handleDetach(port);
          if (detached) {
            rl.close();
            process.exit(0);
            return;
          }
          isDetaching = false;
          break;
        case "stop":
        case "exit":
        case "quit":
          await handleStop();
          rl.close();
          process.exit(0);
          return;
        case "clear":
        case "cls":
          handleClear();
          break;
        case "stats":
          await handleStats(subcommand, true);
          break;
        case "settings":
          await handleSettings(subcommand, arg1, arg2, true);
          break;
        case "":
          // Empty input, just show prompt again
          break;
        default:
          console.log(`${warn}Unknown command: ${command}${reset}`);
          console.log(`Type ${info}help${reset} to see available commands.`);
      }

      promptUser();
    });
  };

  rl.on("close", async () => {
    // Save history before closing
    await saveHistory(commandHistory);
    
    // Handle Ctrl+C or stream end - but not when detaching
    if (!isDetaching)
      killProxy();
  });

  console.log(`\n${info}Type 'help' for available commands.${reset}\n`);
  promptUser();
}

export default async function run(port = 25565) {
  let token: string | null = null;
  if (await tokenExists())
    token = await getToken();

  // Verification
  while (!token)
    token = await promptToken();

  const user = await fetchUser(token);
  if (!user) {
    console.error(`${error}Failed to fetch user data. Cannot continue.${reset}`);
    process.exit(1);
  }

  const config = await getConfig();
  const betaEligible = isBetaEligible(user);
  let useBeta = Boolean(config.receiveBetaReleases) && betaEligible;

  // If beta is enabled in config but the user is NOT eligible, revoke it
  if (config.receiveBetaReleases && !betaEligible) {
    console.warn(
      `${warn}You have beta releases enabled but you don't have the required permissions (tester, partner, developer, or admin).${reset}`,
    );
    console.info(`${info}Disabling beta releases and switching to stable.${reset}`);
    await setConfig("receiveBetaReleases", false);
    useBeta = false;
  }

  // Purge beta proxy if the user shouldn't have it
  const shouldPurge = await isInstalledProxyBetaAndShouldNotBe(betaEligible, useBeta);
  if (shouldPurge) {
    console.warn(
      `${warn}A beta proxy build is installed but you are not eligible for beta. Removing it...${reset}`,
    );
    await cleanupProxyBinaries(null); // delete everything, correct version will be downloaded
    console.info(`${info}Beta proxy removed. A stable build will be downloaded.${reset}`);
  }

  // Check version mismatch
  const { stale, reason } = await isProxyVersionStale(useBeta);
  if (stale) {
    console.info(`${info}Proxy version mismatch: ${reason}${reset}`);
    console.info(`${info}Removing outdated proxy. The correct version will be downloaded...${reset}`);
    await cleanupProxyBinaries(null); // delete everything, correct version will be downloaded
  }

  // Check for existing proxy process
  const existingProxy = await checkForExistingProxy(port);
  if (existingProxy) {
    console.log(`${info}Found existing proxy process (PID: ${existingProxy.pid}). Attaching...${reset}`);
    try {
      await attachToExistingProxy(existingProxy.pid, existingProxy.port, (event, payload) => {
        if (event === "log") {
          console.log(payload);
        }
      });
      console.log(`${info}Attached to existing proxy process (PID: ${existingProxy.pid}, Port: ${existingProxy.port})${reset}`);
    } catch (err) {
      console.error(`${error}Failed to attach: ${err}${reset}`);
      throw err;
    }
    // Start the interactive command prompt immediately since we're attached
    await startInteractivePrompt(port);
    return;
  }

  let proxyReady = false;
  let resolveProxyReady: () => void;
  const proxyReadyPromise = new Promise<void>((resolve) => {
    resolveProxyReady = resolve;
  });

  await launchProxy(port, (event, payload) => {
    if (event === "log") {
      console.log(payload);
      // Detect when proxy is ready (looks for the success message)
      if (payload.includes("Proxy running on") || payload.includes("[✓]")) {
        if (!proxyReady) {
          proxyReady = true;
          resolveProxyReady();
        }
      }
    }
    if (event === "progress") {
      const { downloaded, total, speed } = payload;
      if (total) {
        const percent = ((downloaded / total) * 100).toFixed(1);
        process.stdout.write(
          `Downloading: ${percent}% (${(speed / 1024).toFixed(1)} KB/s)\r`,
        );
      }
    }
  }, useBeta);

  // Wait for proxy to be ready before starting interactive prompt
  await proxyReadyPromise;

  // Start the interactive command prompt
  await startInteractivePrompt(port);
}

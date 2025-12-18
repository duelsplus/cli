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
} from "@core/proxy";
import { password } from "@inquirer/prompts";
import * as readline from "node:readline";

async function promptToken(): Promise<string> {
  while (true) {
    const token = await password({
      message: "Enter your verification token:",
      mask: "*",
      async validate(value: string) {
        if (value.trim().length === 0) {
          return "Invalid token";
        }

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


async function startInteractivePrompt(port: number) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  let isDetaching = false;

  const promptUser = () => {
    rl.question(prompt, async (input) => {
      const parts = input.trim().split(/\s+/);
      const command = parts[0]?.toLowerCase() || "";
      const subcommand = parts[1];

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

  rl.on("close", () => {
    // Handle Ctrl+C or stream end - but not when detaching
    if (!isDetaching) {
      killProxy();
    }
  });

  console.log(`\n${info}Type 'help' for available commands.${reset}\n`);
  promptUser();
}

export default async function run(port = 25565) {
  let token: string | null = null;
  let enteredManually = false;
  if (await tokenExists()) {
    token = await getToken();
  }

  //verification
  while (!token) {
    token = await promptToken();
  }

  //const user = await ensureEntitled(token);
  //
  
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
  });

  // Wait for proxy to be ready before starting interactive prompt
  await proxyReadyPromise;

  // Start the interactive command prompt
  await startInteractivePrompt(port);
}

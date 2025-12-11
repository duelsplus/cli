import {
  error,
  warn,
  info,
  reset,
  prompt,
  brand,
  brandRed,
  brandDarkRed,
} from "@lib/constants";
import { tokenExists, getToken, saveToken, verifyToken } from "@core/auth";
import {
  proxyEmitter,
  launchProxy,
  killProxy,
  waitForProxyToStop,
  getProxyStatus,
} from "@core/proxy";
import { checkForUpdates } from "@core/proxy";
import { password, input, select, confirm } from "@inquirer/prompts";
import * as readline from "node:readline";
import { version } from "../../package.json";

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

function showHelp() {
  console.log(`
${info}Available commands:${reset}
  help     - Show this help message
  status   - Show proxy status
  update   - Check for proxy updates
  stop     - Stop the proxy and exit
  clear    - Clear the terminal
`);
}

function showStatus(port: number) {
  const running = getProxyStatus();
  if (running) {
    console.log(`${info}Proxy:${reset} running on port ${port}`);
  } else {
    console.log(`${warn}Proxy:${reset} not running`);
  }
}

async function startInteractivePrompt(port: number) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const promptUser = () => {
    rl.question(prompt, async (input) => {
      const command = input.trim().toLowerCase();

      switch (command) {
        case "help":
        case "?":
          showHelp();
          break;
        case "status":
          showStatus(port);
          break;
        case "update":
          console.log(`${info}Checking for updates...${reset}`);
          try {
            await checkForUpdates();
            console.log(`${info}Update check complete.${reset}`);
          } catch (err) {
            console.error(
              `${error}Failed to check for updates: ${err}${reset}`,
            );
          }
          break;
        case "stop":
        case "exit":
        case "quit":
          console.log(`${warn}Shutting down proxy...${reset}`);
          killProxy();
          await waitForProxyToStop();
          rl.close();
          process.exit(0);
          return;
        case "clear":
        case "cls":
          console.clear();
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
    // Handle Ctrl+C or stream end
    killProxy();
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

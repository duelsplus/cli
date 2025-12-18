import { error, warn, info, reset, brand } from "@lib/constants";
import { runtimeState } from "@lib/state";
import { parseArgs } from "node:util";
import { version } from "../package.json";
import run from "@cmd/run";
import {
  proxyEmitter,
  checkForUpdates,
  killProxy,
  getProxyStatus,
  waitForProxyToStop,
} from "@core/proxy";
import { checkForUpdates as checkForCliUpdates } from "@core/updates";
import { handleStats } from "@cmd/stats";

const { values, positionals } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    port: { type: "string", short: "p" },
    help: { type: "boolean", short: "h" },
    "no-update": { type: "boolean" },
    "updates-are-a-lie": { type: "boolean" },
    "force-update": { type: "boolean" }, //--force/-f does the same
    force: { type: "boolean", short: "f" },
    proxy: { type: "string" },
  },
  strict: false,
  allowPositionals: true,
});
const command = positionals[0];
const subcommand = positionals[1];

function showHelp() {
  console.log(`
${brand} CLI

${info}Commands:${reset}
  (default)           Start the proxy server
  help                Show this help message
  version             Show the CLI version
  update              Force update the proxy to latest version
  kill                Stop a running proxy
  stats [user|global] Show statistics (user: your stats, global: server stats)

${info}Options:${reset}
  --port              Port to run the proxy on (default: 25565)
  --proxy <path>      Use a custom binary instead of downloading
  --no-update         Skip update step when starting
  --force-update, -f  Force download the latest proxy release
  --help, -h          Show this help message

${info}Interactive Commands:${reset}
  Once the proxy is running, you can type these commands:
  help                Show available commands
  status              Show proxy status
  update              Check for proxy updates
  stop                Stop the proxy and exit
  clear               Clear the terminal
`);
}

process.on("SIGINT", async () => {
  killProxy();
  await waitForProxyToStop();
  process.exit(0);
});

proxyEmitter.on("crash", (msg) => {
  console.error(
    `\n${brand} ${error}has crashed unexpectedly. See details below:${reset}`,
  );
  console.error(`${error}${msg}${reset}`);
  console.error(
    `\n${warn}If this issue persists, please open a ticket on our Discord:${reset} ${info}https://discord.gg/YD4JZnuGYv${reset}\n`,
  );
  process.exit(1);
});

(async () => {
  // Handle --help flag
  if (values.help) {
    showHelp();
    process.exit(0);
  }
  if (values["force-update"] || values.force) {
    runtimeState.forceUpdate = true;
  }
  if (values.proxy !== undefined) {
    if (typeof values.proxy === "string") {
      runtimeState.proxyPath = values.proxy;
      console.log(`${info}Using custom proxy binary: ${values.proxy}${reset}`);
    } else {
      console.error(
        `${error}--proxy requires a value. Example: --proxy ./duelsplus-0.0.1-node18-linux-x64${reset}`,
      );
      process.exit(1);
    }
  }
  if (
    (values["force-update"] || values.force) &&
    (values["no-update"] || values["updates-are-a-lie"])
  ) {
    console.log(
      `${error}That combination doesn't make sense. You can't force an update and skip updates at the same time.`,
    );
    process.exit(1);
  }
  if (values["no-update"]) {
    console.warn(
      `${warn}You have disabled updates using the --no-update argument\nAutomatic updates keep Duels+ safe and stable for both sides. Updates contain bug fixes and security patches. Skipping them leaves you exposed. Proceed at your own risk.`,
    );
  } else if (values["updates-are-a-lie"]) {
    runtimeState.noUpdate = true;
    console.warn(
      `${warn}You have disabled updates using the --updates-are-a-lie argument\nAutomatic updates keep Duels+ safe and stable for both sides. Updates contain bug fixes and security patches. Skipping them leaves you exposed. Proceed at your own risk.`,
    );
  } else {
    await checkForCliUpdates();
  }
  switch (command) {
    case undefined:
      const port = values.port ? Number(values.port) : 25565;
      if (isNaN(port) || port < 1 || port > 65535) {
        console.error(`${error}Invalid port number: ${values.port}${reset}`);
        process.exit(1);
      } else {
        try {
          await run(port);
        } catch (err) {
          console.error(`${error}${err}${reset}`);
          process.exit(1);
        }
      }
      break;
    case "help":
      showHelp();
      process.exit(0);
      break;
    case "version":
      console.log(`v${version}`);
      process.exit(0);
      break;
    case "update":
      await checkForUpdates();
      process.exit(0);
      break;
    case "kill":
      killProxy();
      await waitForProxyToStop();
      process.exit(0);
      break;
    case "stats":
      await handleStats(subcommand, false);
      process.exit(0);
      break;
    default:
      console.error(`${error}Unknown command "${command}"${reset}`);
      process.exit(1);
  }
})();

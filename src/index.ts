import { error, warn, info, reset } from "@lib/constants";
import { parseArgs } from "node:util";
import run from "@cmd/run";
import {
  proxyEmitter,
  checkForUpdates,
  killProxy,
  getProxyStatus,
  waitForProxyToStop,
} from "@core/proxy";
import { checkForUpdates as checkForCliUpdates } from "@core/updates"

const { values, positionals } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    port: { type: "string" },
  },
  strict: true,
  allowPositionals: true,
});
const command = positionals[0];

process.on("SIGINT", async () => {
  killProxy();
  await waitForProxyToStop();
  process.exit(0);
});

proxyEmitter.on("crash", (msg) => {
  console.error(
    `\n${error}Duels+ has crashed unexpectedly. See details below:${reset}`,
  );
  console.error(`${error}${msg}${reset}`);
  console.error(
    `\n${warn}If this issue persists, please open a ticket on our Discord:${reset} ${info}https://discord.gg/YD4JZnuGYv${reset}\n`,
  );
  process.exit(1);
});

(async () => {
  await checkForCliUpdates();
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
    case "update":
      await checkForUpdates();
      process.exit(1);
    case "kill":
      killProxy();
      await waitForProxyToStop();
      process.exit(0);
    default:
      console.error(`${error}Unknown command "${command}"${reset}`);
      process.exit(1);
  }
})();

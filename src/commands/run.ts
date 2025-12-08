import { error, warn, info, reset } from "@lib/constants";
import { tokenExists, getToken, saveToken, verifyToken } from "@core/auth";
import { proxyEmitter, launchProxy } from "@core/proxy";
import { password, log, isCancel } from "@clack/prompts";

async function promptToken(): Promise<string> {
  while (true) {
    const input = await password({
      message: "Enter your verification token:",
      mask: '*',
      validate(value) {
        return value.trim().length === 0 ? "Token cannot be empty" : undefined;
      },
    });

    if (isCancel(input)) process.exit(1);

    if (typeof input === "string") {
      return input;
    }
  }
}

export default async function run(port = 25565) {
  let token: string | null = null;
  let enteredManually = false;
  if (await tokenExists()) {
    token = await getToken();
  }

  //verification
  while (true) {
    if (!token) {
      enteredManually = true;
      token = await promptToken();
    }

    const verify = await verifyToken(token);
    if (verify.success) {
      if (enteredManually) await saveToken(token);
      break;
    } else if (!verify.success && verify.code === "banned") {
      if (enteredManually) await saveToken(token);
      log.error("This account has been banned for breaching the Terms of Service.");
      log.message(`${warn}Appeal this decision:${reset} ${info}https://discord.gg/YD4JZnuGYv${reset}\n`);
      await new Promise(() => {}); //hang forever
    }
    //console.warn(`${warn}Invalid token.${reset}`);
    log.error("Invalid token.");
    token = null; //retry
  }

  //const user = await ensureEntitled(token);
  //
  await launchProxy(port, (event, payload) => {
    if (event === "log") console.log(payload);
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
}

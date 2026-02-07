import { error, info, reset } from "@lib/constants";
import { checkForUpdates } from "@core/proxy";
import { getConfig } from "@core/settings";

export async function handleUpdate(): Promise<void> {
  console.log(`${info}Checking for updates...${reset}`);
  try {
    const config = await getConfig();
    const useBeta = Boolean(config.receiveBetaReleases);
    await checkForUpdates(undefined, false, useBeta);
    console.log(`${info}Update check complete.${reset}`);
  } catch (err) {
    console.error(
      `${error}Failed to check for updates: ${err}${reset}`,
    );
  }
}

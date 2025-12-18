import { error, info, reset } from "@lib/constants";
import { checkForUpdates } from "@core/proxy";

export async function handleUpdate(): Promise<void> {
  console.log(`${info}Checking for updates...${reset}`);
  try {
    await checkForUpdates();
    console.log(`${info}Update check complete.${reset}`);
  } catch (err) {
    console.error(
      `${error}Failed to check for updates: ${err}${reset}`,
    );
  }
}

import { error, info, reset } from "@lib/constants";
import { detachProxy } from "@core/proxy";

export async function handleDetach(port: number): Promise<boolean> {
  try {
    await detachProxy(port);
    console.log(`${info}Proxy detached. It will continue running in the background.${reset}`);
    console.log(`${info}You can reconnect by running the program again.${reset}`);
    return true;
  } catch (err) {
    console.error(
      `${error}Failed to detach proxy: ${err}${reset}`,
    );
    return false;
  }
}

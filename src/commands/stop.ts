import { warn, reset } from "@lib/constants";
import { killProxy, waitForProxyToStop } from "@core/proxy";

export async function handleStop(): Promise<void> {
  console.log(`${warn}Shutting down proxy...${reset}`);
  await killProxy();
  await waitForProxyToStop();
}

import { info, warn, reset } from "@lib/constants";
import { getProxyStatus } from "@core/proxy";

export function handleStatus(port: number): void {
  const running = getProxyStatus();
  if (running) {
    console.log(`${info}Proxy:${reset} running on port ${port}`);
  } else {
    console.log(`${warn}Proxy:${reset} not running`);
  }
}

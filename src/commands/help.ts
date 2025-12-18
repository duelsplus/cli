import { info, reset } from "@lib/constants";

export function handleHelp(): void {
  console.log(`
${info}Available commands:${reset}
  help     - Show this help message
  status   - Show proxy status
  update   - Check for proxy updates
  detach   - Detach from proxy (keeps proxy running in background)
  stop     - Stop the proxy and exit
  clear    - Clear the terminal
  stats [user|global] - Show statistics (user: your stats, global: server stats)
  settings [get|set] - Manage settings (enableMsa, proxyPort, autoUpdate)
`);
}

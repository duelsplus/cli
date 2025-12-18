import path from "node:path";
import os from "node:os";

/**
 * Get the base directory for Duels+ data files
 */
export function getDuelsPlusDir(): string {
  return path.join(os.homedir(), ".duelsplus");
}

/**
 * Get path to a file in the Duels+ directory
 */
export function getDuelsPlusPath(...segments: string[]): string {
  return path.join(getDuelsPlusDir(), ...segments);
}

/**
 * Get OS-specific config directory path
 */
export function getConfigDir(): string {
  const platform = process.platform;
  const homeDir = os.homedir();

  if (platform === "win32") {
    return path.join(homeDir, "AppData", "Roaming", "Duels+");
  } else if (platform === "darwin") {
    return path.join(homeDir, "Library", "Application Support", "Duels+");
  } else {
    // Linux and others
    return path.join(homeDir, ".config", "Duels+");
  }
}

/**
 * Get path to config file
 */
export function getConfigPath(): string {
  return path.join(getConfigDir(), "config.json");
}

/**
 * Get path to command history file
 */
export function getHistoryPath(): string {
  return getDuelsPlusPath("command_history.txt");
}

/**
 * Get path to token file
 */
export function getTokenPath(): string {
  return getDuelsPlusPath("tokens.json");
}

/**
 * Get path to account auth directory
 */
export function getAccountAuthPath(): string {
  return getDuelsPlusPath("accountAuth");
}

/**
 * Get path to proxy install directory
 */
export function getProxyInstallDir(): string {
  return getDuelsPlusPath("proxy");
}

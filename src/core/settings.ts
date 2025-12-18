import { file, write } from "bun";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

interface Config {
  minimizeToTray?: boolean;
  autoUpdate?: boolean;
  openLogsOnLaunch?: boolean;
  reducedMotion?: boolean;
  enableRpc?: boolean;
  proxyPort?: string;
  enableMsa?: boolean;
}

function getConfigPath(): string {
  const platform = process.platform;
  const homeDir = os.homedir();

  if (platform === "win32") {
    return path.join(homeDir, "AppData", "Roaming", "Duels+", "config.json");
  } else if (platform === "darwin") {
    return path.join(homeDir, "Library", "Application Support", "Duels+", "config.json");
  } else {
    // Linux and others
    return path.join(homeDir, ".config", "Duels+", "config.json");
  }
}

export async function getConfig(): Promise<Config> {
  const configPath = getConfigPath();
  
  try {
    if (await file(configPath).exists()) {
      const raw = await file(configPath).text();
      return JSON.parse(raw);
    }
  } catch (err) {
    // If file doesn't exist or is invalid, return defaults
  }

  // Return default config
  return {
    minimizeToTray: false,
    autoUpdate: true,
    openLogsOnLaunch: true,
    reducedMotion: false,
    enableRpc: true,
    proxyPort: "25565",
    enableMsa: false,
  };
}

export async function setConfig(key: keyof Config, value: string | boolean): Promise<boolean> {
  try {
    const config = await getConfig();
    const configPath = getConfigPath();
    const configDir = path.dirname(configPath);

    // Ensure directory exists
    await mkdir(configDir, { recursive: true }).catch(() => {});

    // Update the config value
    if (key === "proxyPort") {
      config.proxyPort = String(value);
    } else if (key === "autoUpdate" || key === "enableMsa") {
      config[key] = Boolean(value);
    } else {
      return false; // Invalid key
    }

    // Write config back
    await write(configPath, JSON.stringify(config, null, "\t"));
    return true;
  } catch (err) {
    return false;
  }
}

export async function getConfigValue(key: keyof Config): Promise<string | boolean | undefined> {
  const config = await getConfig();
  return config[key];
}

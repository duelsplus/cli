import { getConfigPath } from "@lib/paths";
import { readJsonFile, writeJsonFile } from "@lib/files";

interface Config {
  minimizeToTray?: boolean;
  autoUpdate?: boolean;
  openLogsOnLaunch?: boolean;
  reducedMotion?: boolean;
  enableRpc?: boolean;
  proxyPort?: string;
  enableMsa?: boolean;
}

const defaultConfig: Config = {
  minimizeToTray: false,
  autoUpdate: true,
  openLogsOnLaunch: true,
  reducedMotion: false,
  enableRpc: true,
  proxyPort: "25565",
  enableMsa: false,
};

export async function getConfig(): Promise<Config> {
  const configPath = getConfigPath();
  const config = await readJsonFile<Config>(configPath);
  return config ?? defaultConfig;
}

export async function setConfig(key: keyof Config, value: string | boolean): Promise<boolean> {
  try {
    const config = await getConfig();
    const configPath = getConfigPath();

    // Update the config value
    if (key === "proxyPort") {
      config.proxyPort = String(value);
    } else if (key === "autoUpdate" || key === "enableMsa") {
      config[key] = Boolean(value);
    } else {
      return false; // Invalid key
    }

    // Write config back
    await writeJsonFile(configPath, config);
    return true;
  } catch (err) {
    return false;
  }
}

export async function getConfigValue(key: keyof Config): Promise<string | boolean | undefined> {
  const config = await getConfig();
  return config[key];
}

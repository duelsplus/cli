import { getConfigPath } from "@lib/paths";
import { readJsonFile, writeJsonFile } from "@lib/files";

export interface Config {
  autoUpdate?: boolean;
  proxyPort?: string;
  enableMsa?: boolean;
}

export const defaultConfig: Config = {
  autoUpdate: true,
  proxyPort: "25565",
  enableMsa: false,
};

// All valid config keys for validation
export const configKeys = Object.keys(defaultConfig) as (keyof Config)[];

// Boolean config keys
export const booleanConfigKeys: (keyof Config)[] = [
  "autoUpdate",
  "enableMsa",
];

// String config keys
export const stringConfigKeys: (keyof Config)[] = ["proxyPort"];

export async function getConfig(): Promise<Config> {
  const configPath = getConfigPath();
  const config = await readJsonFile<Config>(configPath);
  return { ...defaultConfig, ...config };
}

export async function setConfig(key: keyof Config, value: string | boolean): Promise<boolean> {
  try {
    const config = await getConfig();
    const configPath = getConfigPath();

    // Update the config value based on key type
    if (stringConfigKeys.includes(key)) {
      (config as Record<string, string | boolean>)[key] = String(value);
    } else if (booleanConfigKeys.includes(key)) {
      (config as Record<string, string | boolean>)[key] = Boolean(value);
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

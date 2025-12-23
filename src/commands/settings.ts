import { error, info, reset } from "@lib/constants";
import {
  getConfig,
  setConfig,
  getConfigValue,
  configKeys,
  booleanConfigKeys,
  stringConfigKeys,
  Config,
} from "@core/settings";
import { renderSettingsUI } from "../components/SettingsUI";

export async function handleSettings(
  subcommand: string | undefined,
  key: string | undefined,
  value: string | undefined,
  interactive: boolean,
): Promise<void> {
  if (!subcommand) {
    // Launch interactive settings UI
    await renderSettingsUI();
    return;
  }

  const cmd = subcommand.toLowerCase();

  // "list" subcommand to show all settings without interactive UI
  if (cmd === "list") {
    const config = await getConfig();
    console.log(`\n${info}Current Settings:${reset}`);
    for (const k of configKeys) {
      const val = config[k];
      console.log(`  ${k}: ${val}`);
    }
    console.log();
    return;
  }

  if (cmd === "get") {
    if (!key) {
      const message = `${error}Usage: settings get <key>${reset}`;
      console.log(message);
      if (!interactive) process.exit(1);
      return;
    }

    if (!configKeys.includes(key as keyof Config)) {
      const message = `${error}Invalid key. Valid keys: ${configKeys.join(", ")}${reset}`;
      console.log(message);
      if (!interactive) process.exit(1);
      return;
    }

    const val = await getConfigValue(key as keyof Config);
    console.log(`${info}${key}:${reset} ${val ?? "not set"}`);
    return;
  }

  if (cmd === "set") {
    if (!key || value === undefined) {
      const message = `${error}Usage: settings set <key> <value>${reset}`;
      console.log(message);
      if (!interactive) process.exit(1);
      return;
    }

    if (!configKeys.includes(key as keyof Config)) {
      const message = `${error}Invalid key. Valid keys: ${configKeys.join(", ")}${reset}`;
      console.log(message);
      if (!interactive) process.exit(1);
      return;
    }

    // Parse value based on key type
    let parsedValue: string | boolean;
    if (stringConfigKeys.includes(key as keyof Config)) {
      // String type keys
      if (key === "proxyPort") {
        const port = parseInt(value, 10);
        if (isNaN(port) || port < 1 || port > 65535) {
          const message = `${error}Invalid port number. Must be between 1 and 65535.${reset}`;
          console.log(message);
          if (!interactive) process.exit(1);
          return;
        }
        parsedValue = String(port);
      } else {
        parsedValue = value;
      }
    } else if (booleanConfigKeys.includes(key as keyof Config)) {
      const lowerValue = value.toLowerCase();
      if (
        lowerValue === "true" ||
        lowerValue === "1" ||
        lowerValue === "yes" ||
        lowerValue === "on"
      ) {
        parsedValue = true;
      } else if (
        lowerValue === "false" ||
        lowerValue === "0" ||
        lowerValue === "no" ||
        lowerValue === "off"
      ) {
        parsedValue = false;
      } else {
        const message = `${error}Invalid boolean value. Use 'true' or 'false'.${reset}`;
        console.log(message);
        if (!interactive) process.exit(1);
        return;
      }
    } else {
      const message = `${error}Invalid key.${reset}`;
      console.log(message);
      if (!interactive) process.exit(1);
      return;
    }

    const success = await setConfig(key as keyof Config, parsedValue);
    if (success) {
      console.log(`${info}Setting ${key} updated to ${parsedValue}${reset}`);
    } else {
      const message = `${error}Failed to update setting.${reset}`;
      console.log(message);
      if (!interactive) process.exit(1);
    }
    return;
  }

  // Unknown subcommand
  const message = `${error}Unknown subcommand: ${subcommand}. Use 'get', 'set', 'list', or no subcommand for interactive UI.${reset}`;
  console.log(message);
  if (!interactive) process.exit(1);
}

import React, { useState, useEffect } from "react";
import { render, Box, Text, useInput, useApp } from "ink";
import type { Instance } from "ink";
import {
  getConfig,
  setConfig,
  type Config,
  configKeys,
  booleanConfigKeys,
  defaultConfig,
} from "@core/settings";
import { info, reset } from "@lib/constants";

interface SettingItem {
  key: keyof Config;
  label: string;
  description: string;
  type: "boolean" | "string";
}

const settingsDefinitions: SettingItem[] = [
  {
    key: "proxyPort",
    label: "Proxy Port",
    description: "Port for the proxy server (1-65535)",
    type: "string",
  },
  {
    key: "autoUpdate",
    label: "Auto Update",
    description: "Automatically check for updates on startup",
    type: "boolean",
  },
  {
    key: "enableMsa",
    label: "Enable MSA",
    description: "Enable Microsoft Authentication",
    type: "boolean",
  },
];

function SettingsApp({ onExit }: { onExit: () => void }) {
  const { exit } = useApp();
  const [config, setConfigState] = useState<Config>(defaultConfig);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    const cfg = await getConfig();
    setConfigState(cfg);
    setLoading(false);
  };

  const showMessage = (text: string, type: "success" | "error") => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 2000);
  };

  const handleToggle = async (key: keyof Config) => {
    const currentValue = config[key] as boolean;
    const newValue = !currentValue;
    const success = await setConfig(key, newValue);
    if (success) {
      setConfigState((prev) => ({ ...prev, [key]: newValue }));
      showMessage(`${key} set to ${newValue}`, "success");
    } else {
      showMessage("Failed to save setting", "error");
    }
  };

  const handleSaveString = async (key: keyof Config, value: string) => {
    if (key === "proxyPort") {
      const port = parseInt(value, 10);
      if (isNaN(port) || port < 1 || port > 65535) {
        showMessage("Invalid port (must be 1-65535)", "error");
        return;
      }
    }

    const success = await setConfig(key, value);
    if (success) {
      setConfigState((prev) => ({ ...prev, [key]: value }));
      showMessage(`${key} set to ${value}`, "success");
      setIsEditing(false);
      setEditValue("");
    } else {
      showMessage("Failed to save setting", "error");
    }
  };

  useInput((input, key) => {
    if (loading) return;

    if (input.toLowerCase() === "q") {
      onExit();
      exit();
      return;
    }

    if (key.escape) {
      if (isEditing) {
        setIsEditing(false);
        setEditValue("");
      } else {
        onExit();
        exit();
      }
      return;
    }

    if (isEditing) {
      const currentSetting = settingsDefinitions[selectedIndex];
      if (!currentSetting) return;

      if (key.return) {
        handleSaveString(currentSetting.key, editValue);
        return;
      }

      if (key.backspace || key.delete) {
        setEditValue((prev) => prev.slice(0, -1));
        return;
      }

      if (currentSetting.key === "proxyPort") {
        if (/^\d$/.test(input)) {
          setEditValue((prev) => prev + input);
        }
      } else {
        setEditValue((prev) => prev + input);
      }
      return;
    }

    if (key.upArrow) {
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : settingsDefinitions.length - 1));
    } else if (key.downArrow) {
      setSelectedIndex((prev) => (prev < settingsDefinitions.length - 1 ? prev + 1 : 0));
    } else if (key.return || input === " ") {
      const currentSetting = settingsDefinitions[selectedIndex];
      if (!currentSetting) return;
      if (currentSetting.type === "boolean") {
        handleToggle(currentSetting.key);
      } else {
        setIsEditing(true);
        setEditValue(String(config[currentSetting.key] ?? ""));
      }
    }
  });

  if (loading) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="cyan">Loading settings...</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color="red">Duels</Text>
        <Text bold color="#aa0000">+</Text>
        <Text bold> Settings</Text>
      </Box>

      {/* Help text */}
      <Box marginBottom={1}>
        <Text dimColor>
          {isEditing
            ? "Type value, Enter to save, Esc to cancel"
            : "↑↓ Navigate • Enter/Space to toggle • Q/Esc to exit"}
        </Text>
      </Box>

      {/* Settings list */}
      <Box flexDirection="column">
        {settingsDefinitions.map((setting, index) => {
          const isSelected = index === selectedIndex;
          const value = config[setting.key];
          const isCurrentlyEditing = isSelected && isEditing;

          return (
            <Box key={setting.key} flexDirection="column">
              <Box>
                {/* Selection indicator */}
                <Text color={isSelected ? "cyan" : undefined}>
                  {isSelected ? "❯ " : "  "}
                </Text>

                {/* Setting name */}
                <Box width={22}>
                  <Text bold={isSelected} color={isSelected ? "white" : "gray"}>
                    {setting.label}
                  </Text>
                </Box>

                {/* Value */}
                <Box width={16}>
                  {setting.type === "boolean" ? (
                    <Text color={value ? "green" : "red"}>
                      {value ? "● Enabled" : "○ Disabled"}
                    </Text>
                  ) : isCurrentlyEditing ? (
                    <Text>
                      <Text color="cyan">{editValue}</Text>
                      <Text color="cyan">▋</Text>
                    </Text>
                  ) : (
                    <Text color="yellow">{String(value)}</Text>
                  )}
                </Box>

                {/* Description */}
                <Text dimColor> {setting.description}</Text>
              </Box>
            </Box>
          );
        })}
      </Box>

      {/* Message */}
      {message && (
        <Box marginTop={1}>
          <Text color={message.type === "success" ? "green" : "red"}>
            {message.type === "success" ? "✓ " : "✗ "}
            {message.text}
          </Text>
        </Box>
      )}
    </Box>
  );
}

export async function renderSettingsUI(): Promise<void> {
  if (!process.stdin.isTTY) {
    const config = await getConfig();
    console.log(`\n${info}Current Settings:${reset}`);
    for (const k of configKeys) {
      const val = config[k];
      console.log(`  ${k}: ${val}`);
    }
    console.log(`\nRun in an interactive terminal for the full settings UI.`);
    return;
  }

  return new Promise((resolve) => {
    let instance: Instance;
    try {
      instance = render(<SettingsApp onExit={() => {}} />);

      instance.waitUntilExit().then(() => {
        resolve();
      });
    } catch (err) {
      console.error("Interactive mode not available. Use 'settings list' instead.");
      resolve();
    }
  });
}


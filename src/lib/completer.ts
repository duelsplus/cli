// Command completion definitions
export const commands = [
  "help",
  "status",
  "update",
  "detach",
  "stop",
  "exit",
  "quit",
  "clear",
  "cls",
  "stats",
  "settings",
];

export const statsSubcommands = ["user", "global"];

export const settingsSubcommands = ["get", "set"];

export const settingsKeys = ["enableMsa", "proxyPort", "autoUpdate"];

export const booleanValues = ["true", "false", "1", "0", "yes", "no", "on", "off"];

export function completer(line: string): [string[], string] {
  const parts = line.trim().split(/\s+/);
  const currentPart = parts[parts.length - 1] || "";
  const previousPart = parts[parts.length - 2] || "";

  // Empty line - suggest all commands
  if (parts.length === 1 && !currentPart) {
    return [commands, line];
  }

  // First word - suggest commands that match
  if (parts.length === 1) {
    const matches = commands.filter((cmd) => cmd.startsWith(currentPart.toLowerCase()));
    return [matches, currentPart];
  }

  const command = parts[0].toLowerCase();

  // Stats command completion
  if (command === "stats") {
    if (parts.length === 2) {
      // Suggest subcommands
      const matches = statsSubcommands.filter((sub) => sub.startsWith(currentPart.toLowerCase()));
      return [matches, currentPart];
    }
    return [[], line];
  }

  // Settings command completion
  if (command === "settings") {
    if (parts.length === 2) {
      // Suggest subcommands
      const matches = settingsSubcommands.filter((sub) => sub.startsWith(currentPart.toLowerCase()));
      return [matches, currentPart];
    }
    if (parts.length === 3 && previousPart === "get") {
      // Suggest keys for "get"
      const matches = settingsKeys.filter((key) => key.startsWith(currentPart));
      return [matches, currentPart];
    }
    if (parts.length === 3 && previousPart === "set") {
      // Suggest keys for "set"
      const matches = settingsKeys.filter((key) => key.startsWith(currentPart));
      return [matches, currentPart];
    }
    if (parts.length === 4 && previousPart === "set") {
      // Suggest values based on the key
      const key = parts[2];
      if (key === "proxyPort") {
        // Port numbers - could suggest common ports, but for now just return empty
        return [[], line];
      }
      if (key === "autoUpdate" || key === "enableMsa") {
        // Boolean values
        const matches = booleanValues.filter((val) => val.startsWith(currentPart.toLowerCase()));
        return [matches, currentPart];
      }
    }
    return [[], line];
  }

  // No completion for other commands
  return [[], line];
}

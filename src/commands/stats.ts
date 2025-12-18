import { error, info, reset } from "@lib/constants";
import { tokenExists, getToken } from "@core/auth";
import { getUser, getStats, getGlobalStats } from "@core/user";
import { formatStats } from "@lib/formatters";

async function handleUserStats(interactive: boolean): Promise<void> {
  try {
    if (!(await tokenExists())) {
      const message = interactive
        ? `${error}No token found.${reset}`
        : `${error}No token found. Please run the proxy first to authenticate.${reset}`;
      console.log(message);
      if (!interactive) process.exit(1);
      return;
    }

    const token = await getToken();
    if (!token) {
      const message = interactive
        ? `${error}Failed to retrieve token.${reset}`
        : `${error}Failed to retrieve token.${reset}`;
      console.log(message);
      if (!interactive) process.exit(1);
      return;
    }

    if (interactive) {
      console.log(`${info}Fetching user stats...${reset}`);
    }

    const userResult = await getUser(token);
    if (!userResult.success || !userResult.data) {
      const message = `${error}Failed to fetch user data: ${userResult.code || "unknown error"}${reset}`;
      console.log(message);
      if (!interactive) process.exit(1);
      return;
    }

    const username = (userResult.data as any).username || "Unknown";
    const result = await getStats(token);

    if (result.success && result.data) {
      formatStats(result.data, username);
    } else {
      const message = `${error}Failed to fetch stats: ${result.code || "unknown error"}${reset}`;
      console.log(message);
      if (!interactive) process.exit(1);
    }
  } catch (err: any) {
    const message = `${error}Failed to fetch stats: ${err.message}${reset}`;
    console.log(message);
    if (!interactive) process.exit(1);
  }
}

async function handleGlobalStats(interactive: boolean): Promise<void> {
  try {
    if (interactive) {
      console.log(`${info}Fetching global stats...${reset}`);
    }

    const result = await getGlobalStats();

    if (result.success && result.data) {
      // Normalize global stats structure to match formatter expectations
      const globalStats = result.data.globalStats || result.data;
      const normalizedData = {
        stats: {
          wins: globalStats.totalWins || 0,
          losses: (globalStats.totalGames || 0) - (globalStats.totalWins || 0),
          winLossRatio: globalStats.winLossRatio || 0,
        },
      };
      formatStats(normalizedData, "Global");
    } else {
      const message = `${error}Failed to fetch global stats: ${result.code || "unknown error"}${reset}`;
      console.log(message);
      if (!interactive) process.exit(1);
    }
  } catch (err: any) {
    const message = `${error}Failed to fetch global stats: ${err.message}${reset}`;
    console.log(message);
    if (!interactive) process.exit(1);
  }
}

export async function handleStats(subcommand: string | undefined, interactive = false): Promise<void> {
  // Default to "user" if no subcommand provided
  const cmd = subcommand?.toLowerCase() || "user";

  switch (cmd) {
    case "user":
      await handleUserStats(interactive);
      break;
    case "global":
      await handleGlobalStats(interactive);
      break;
    default:
      const message = `${error}Unknown stats subcommand: ${subcommand}. Use 'user' or 'global'.${reset}`;
      console.log(message);
      if (!interactive) process.exit(1);
  }
}

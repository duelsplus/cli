import { info, reset, brandRed } from "@lib/constants";

export function formatStats(statsData: any, username: string) {
  const stats = statsData.stats || statsData;
  const wins = stats.wins || 0;
  const losses = stats.losses || 0;
  const winLossRatio = stats.winLossRatio || 0;

  const padding = " ".repeat(2);
  const headerText = username === "Global" 
    ? "Global statistics" 
    : `${username}'s statistics`;
  
  // Build all lines to calculate the longest one
  const headerLine = `${padding}${headerText}`;
  const winsLine = `${padding}Total Wins:     ${wins.toLocaleString()}`;
  const lossesLine = `${padding}Total Losses:   ${losses.toLocaleString()}`;
  const ratioLine = `${padding}W/L Ratio:      ${winLossRatio.toFixed(2)}`;
  
  // Find the longest line (excluding ANSI codes for length calculation)
  const lines = [headerLine, winsLine, lossesLine, ratioLine];
  const maxLength = Math.max(...lines.map(line => {
    // Remove ANSI codes for length calculation
    const cleanLine = line.replace(/\x1b\[[0-9;]*m/g, '');
    return cleanLine.length;
  }));
  
  const separatorLength = maxLength + 2;
  const separator = "─".repeat(separatorLength);

  console.log(`\n${brandRed}${separator}${reset}`);
  console.log(`${padding}${info}${headerText}${reset}`);
  console.log(`${brandRed}${separator}${reset}`);
  console.log(`${padding}${info}Total Wins:${reset}     ${brandRed}${wins.toLocaleString()}${reset}`);
  console.log(`${padding}${info}Total Losses:${reset}   ${brandRed}${losses.toLocaleString()}${reset}`);
  console.log(`${padding}${info}W/L Ratio:${reset}      ${brandRed}${winLossRatio.toFixed(2)}${reset}`);
  console.log(`${brandRed}${separator}${reset}\n`);
}

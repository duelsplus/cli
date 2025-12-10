import { color } from "bun";

export const error = color("red", "ansi");
export const warn = color("yellow", "ansi");
export const info = color("cyan", "ansi");
export const reset = "\x1b[0m"; // ANSI reset

// Branding
export const brandRed = color("#ff5555", "ansi"); // Bright red
export const brandDarkRed = color("#aa0000", "ansi"); // Dark red
export const brand = `${brandRed}Duels${brandDarkRed}+${reset}`;
export const prompt = `${brandRed}d${brandDarkRed}+${reset}$ `;

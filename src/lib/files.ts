import { file, write } from "bun";
import { mkdir } from "node:fs/promises";
import path from "node:path";

/**
 * Ensure a directory exists, creating it if necessary
 */
export async function ensureDir(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true }).catch(() => {});
}

/**
 * Read a text file, returning null if it doesn't exist or can't be read
 */
export async function readTextFile(filePath: string): Promise<string | null> {
  try {
    if (await file(filePath).exists()) {
      return await file(filePath).text();
    }
  } catch {
    // Ignore errors
  }
  return null;
}

/**
 * Read and parse a JSON file, returning null if it doesn't exist or is invalid
 */
export async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const content = await readTextFile(filePath);
    if (content) {
      return JSON.parse(content) as T;
    }
  } catch {
    // Ignore errors
  }
  return null;
}

/**
 * Write text to a file, ensuring the directory exists first
 */
export async function writeTextFile(filePath: string, content: string): Promise<void> {
  const dir = path.dirname(filePath);
  await ensureDir(dir);
  await write(filePath, content);
}

/**
 * Write JSON to a file with pretty formatting, ensuring the directory exists first
 */
export async function writeJsonFile(filePath: string, data: any): Promise<void> {
  await writeTextFile(filePath, JSON.stringify(data, null, "\t"));
}

/**
 * Check if a file exists
 */
export async function fileExists(filePath: string): Promise<boolean> {
  return await file(filePath).exists();
}

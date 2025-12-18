import { file, write } from "bun";
import { mkdir, rm, chmod } from "node:fs/promises"; //https://bun.com/docs/runtime/file-io#directories
import path from "node:path";
import os from "node:os";

interface User {
  id: string;
  username: string;
  isBanned?: boolean;
  //this interface is minimal and the api always returns the full user object
  //which is not included here; this interface exists to satisfy eslint
}

const TOKEN_PATH = path.join(os.homedir(), ".duelsplus", "tokens.json");
const ACCOUNT_PATH = path.join(os.homedir(), ".duelsplus", "accountAuth");

export async function tokenExists(): Promise<boolean> {
  return await file(TOKEN_PATH).exists();
}

export async function getToken(): Promise<string | null> {
  try {
    const raw = await file(TOKEN_PATH).text();
    const parsed = JSON.parse(raw);
    return parsed.token ?? null;
  } catch {
    return null;
  }
}

export async function saveToken(token: string) {
  const dir = path.dirname(TOKEN_PATH);
  //use node:fs/promises mkdir per bun docs
  await mkdir(dir, { recursive: true }).catch(() => {});
  await write(TOKEN_PATH, JSON.stringify({ token, verifiedAt: Date.now() }));
  try {
    await chmod(TOKEN_PATH, 0o600);
  } catch {
    //ignore
  }
}

export async function deleteToken(): Promise<boolean> {
  try {
    if (await file(TOKEN_PATH).exists()) {
      await rm(TOKEN_PATH, { force: true });
    }
    return true;
  } catch {
    return false;
  }
}

export async function verifyToken(token: string) {
  try {
    const res = await fetch("https://api.venxm.uk/user", {
      headers: { Authorization: `${token}` },
    });

    if (res.status === 200) {
      const data: User = await res.json() as User;
      if (data.isBanned) return { success: false, code: "banned" };
      return {
        success: true,
        userId: data.id,
        username: data.username,
        raw: data,
      };
    }

    if (res.status === 401) return { success: false, code: 401 };
    if (res.status >= 500) return { success: false, code: 500 };
    return { success: false, code: res.status };
  } catch (err: any) {
    return { success: false, code: "network_error", message: err?.message };
  }
}


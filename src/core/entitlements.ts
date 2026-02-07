import { getUser } from "@core/user";


export type Perm =
  | "admin"
  | "developer"
  | "moderator"
  | "tester"
  | "partner"
  | "leaderboard"
  | "supporter"
  | "combo"
  | "standard";

export interface User {
  id: string;
  discordId: string;
  username: string;
  perms: Perm[];
  isBanned: boolean;
}

/** Check whether the user has a specific permission. */
export function hasPerm(user: User | undefined | null, perm: Perm): boolean {
  if (!user || !user.perms) return false;
  return user.perms.includes(perm);
}

/** Beta access requires one of: tester, partner, developer, or admin. */
export function isBetaEligible(user: User | undefined | null): boolean {
  return (
    hasPerm(user, "tester") ||
    hasPerm(user, "partner") ||
    hasPerm(user, "developer") ||
    hasPerm(user, "admin")
  );
}

export async function fetchUser(token: string): Promise<User | null> {
  const res = await getUser(token);
  if (!res.success) return null;

  const data = res.data as User;
  // Normalise – the API may omit the array for users with no special perms
  if (!Array.isArray(data.perms)) {
    data.perms = [];
  }
  return data;
}

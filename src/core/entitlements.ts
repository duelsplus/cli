import { getUser } from "@core/user";

export interface Entitlement {
  feature: string;
  hasAccess: boolean;
}

interface User {
  [key: string]: any;
}

export async function hasEntitlement(
  token: string,
  feature: string,
): Promise<Entitlement> {
  const res = await getUser(token);
  if (!res.success) {
    return { feature, hasAccess: false };
  }

  const user = res.data as User;
  const value = Boolean(user[feature]);
  const hasAccess = feature.startsWith("is") ? !value : value;

  return { feature, hasAccess };
}

export async function ensureEntitlement(token: string, feature: string) {
  const ent = await hasEntitlement(token, feature);
  if (!ent.hasAccess) {
    throw new Error(`Not entitled to "${feature}"`);
  }
  return ent;
}

//prefer fetch over apiGet()
export async function apiGet(url: string, token?: string) {
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(url, { headers });
  if (!res.ok)
    throw new Error(`API request failed: ${res.status} ${res.statusText}`);
  return await res.json();
}

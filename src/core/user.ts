export async function getUser(token: string) {
  try {
    const res = await fetch("https://api.venxm.uk/user", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 200) {
      return { success: true, data: await res.json() };
    }
    if (res.status === 401) return { success: false, code: 401 };
    if (res.status >= 500) return { success: false, code: 500 };
    return { success: false, code: res.status };
  } catch (err: any) {
    return { success: false, code: "network_error", message: err?.message };
  }
}

export async function getStats(token: string) {
  try {
    const res = await fetch("https://api.venxm.uk/user/stats", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 200) {
      return { success: true, data: await res.json() };
    }
    if (res.status === 401) return { success: false, code: 401 };
    if (res.status >= 500) return { success: false, code: 500 };
    return { success: false, code: res.status };
  } catch (err: any) {
    return { success: false, code: "network_error", message: err?.message };
  }
}

export async function getGlobalStats() {
  try {
    const res = await fetch("https://duelsplus.com/api/stats");
    if (res.status === 200) {
      return { success: true, data: await res.json() };
    }
    if (res.status >= 500) return { success: false, code: 500 };
    return { success: false, code: res.status };
  } catch (err: any) {
    return { success: false, code: "network_error", message: err?.message };
  }
}

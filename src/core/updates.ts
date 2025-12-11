import semver from "semver";
import { version as localVersion } from "../../package.json";
import { info, warn, reset } from "@lib/constants";

interface Version {
  id: string;
  tag_name: string;
  //this interface is minimal and the api always returns the full user object
  //which is not included here; this interface exists to satisfy eslint
}

async function getLatestVersion(): Promise<string | null> {
  const res = await fetch(
    "https://api.github.com/repos/duelsplus/cli/releases/latest",
  );
  if (!res.ok) return null;

  const json = (await res.json()) as Version;
  return json.tag_name?.replace(/^v/, "");
}

function isUpdateAvailable(local: string, remote: string): boolean {
  if (semver.valid(local) && semver.valid(remote)) {
    return semver.lt(local, remote);
  }
  return local !== remote; //fallback
}

function notify(latest: string) {
  console.log(
    `Update available: ${warn}${localVersion}${reset} → ${info}${latest}${reset}`,
  );
  console.log(
    `View release: ${info}https://github.com/duelsplus/cli/releases/tag/v${latest}${reset}`,
  );
}

export async function checkForUpdates() {
  const latest = await getLatestVersion();
  if (!latest) return null;
  if (isUpdateAvailable(localVersion, latest)) {
    notify(latest);
  }

  return latest;
}

export function checkForUpdatesAsync() {
  checkForUpdates().catch(() => {});
}

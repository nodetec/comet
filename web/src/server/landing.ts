import { createServerFn } from "@tanstack/react-start";
import { getLatestRelease, findAsset } from "./github";

export const getDownloads = createServerFn({ method: "GET" }).handler(
  async () => {
    const release = await getLatestRelease();
    if (!release) return { tag: null, downloads: {} };
    return {
      tag: release.tag,
      downloads: {
        macArm: findAsset(release.assets, "aarch64.dmg")?.url,
        macIntel: findAsset(release.assets, "x64.dmg")?.url,
        linuxAppImage: findAsset(release.assets, ".AppImage")?.url,
        linuxDeb: findAsset(release.assets, ".deb")?.url,
        linuxRpm: findAsset(release.assets, ".rpm")?.url,
      },
    };
  },
);

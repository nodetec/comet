const REPO = "nodetec/comet";

export type ReleaseAsset = {
  name: string;
  url: string;
};

export type Release = {
  tag: string;
  assets: ReleaseAsset[];
};

let cached: { release: Release | null; fetchedAt: number } | null = null;
const CACHE_TTL = 300_000; // 5 minutes

export async function getLatestRelease(): Promise<Release | null> {
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return cached.release;
  }
  try {
    const res = await fetch(
      `https://api.github.com/repos/${REPO}/releases/latest`,
      { headers: { "User-Agent": "comet-web" } },
    );
    if (!res.ok) return null;
    const data = await res.json();
    const release: Release = {
      tag: data.tag_name,
      assets: (data.assets ?? []).map(
        (a: { name: string; browser_download_url: string }) => ({
          name: a.name,
          url: a.browser_download_url,
        }),
      ),
    };
    cached = { release, fetchedAt: Date.now() };
    return release;
  } catch {
    return null;
  }
}

export function findAsset(
  assets: ReleaseAsset[],
  pattern: string,
): ReleaseAsset | undefined {
  return assets.find((a) =>
    a.name.toLowerCase().includes(pattern.toLowerCase()),
  );
}

import { canonicalizeTagPath } from "@/features/editor/lib/tags";

function unwrapAuthoredTag(raw: string): string {
  let value = raw.trim();

  if (value.startsWith("#") && value.endsWith("#") && value.length > 2) {
    value = value.slice(1, -1);
  } else if (value.startsWith("#")) {
    value = value.slice(1);
  }

  return value.trim();
}

export function normalizePublishTag(raw: string): string | null {
  return canonicalizeTagPath(unwrapAuthoredTag(raw));
}

export function normalizePublishTags(tags: string[]): string[] {
  const normalized = new Set<string>();

  for (const tag of tags) {
    const canonical = normalizePublishTag(tag);
    if (canonical) {
      normalized.add(canonical);
    }
  }

  return [...normalized];
}

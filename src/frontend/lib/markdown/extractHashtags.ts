import { getHashtagRegexString } from "./getHashtagRegexString";

export function extractHashtags(text: string): string[] {
  const REGEX = new RegExp(getHashtagRegexString(), "gi");

  const matches = [...text.matchAll(REGEX)];
  if (!matches.length) return [];

  const hashtags = matches.map((m) => m[3]);
  return Array.from(new Set(hashtags));
}

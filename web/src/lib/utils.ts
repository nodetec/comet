import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

export function formatTimestamp(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toLocaleString();
}

export function usagePercent(used: number, limit: number): number {
  if (limit === 0) return 0;
  return Math.min(100, Math.round((used / limit) * 100));
}

const KIND_LABELS: Record<number, string> = {
  0: "Metadata",
  1: "Note",
  3: "Contacts",
  4: "DM",
  5: "Delete",
  7: "Reaction",
  9: "Delete",
  23: "Long-form",
  1059: "Gift Wrap",
  10002: "Relay List",
  24242: "Blossom Auth",
  30023: "Long-form",
};

export function kindLabel(kind: number): string {
  return KIND_LABELS[kind] ?? `Kind ${kind}`;
}

export function shortPubkey(pubkey: string): string {
  return pubkey.slice(0, 8) + "\u2026";
}

export function usageColor(pct: number): string {
  if (pct >= 95) return "bg-destructive";
  if (pct >= 80) return "bg-yellow-500";
  return "bg-primary";
}

export const DEFAULT_STORAGE_LIMIT_BYTES = 1_073_741_824; // 1 GB

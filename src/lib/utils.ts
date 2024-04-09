import { clsx, type ClassValue } from "clsx";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function fromNow(createdAt: string | undefined) {
  if (!createdAt) {
    return undefined;
  }
  dayjs.extend(relativeTime);
  const time = dayjs(createdAt).fromNow();
  return time;
}

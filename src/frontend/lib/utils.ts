import { clsx, type ClassValue } from "clsx";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const assignRef = (
  lastNoteRef: (node?: Element | null) => void,
  pageIndex: number,
  noteIndex: number,
  // TODO: Replace any with a proper type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any,
) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isLastNote = (pageIndex: number, noteIndex: number, data: any) =>
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    pageIndex === data.pages.length - 1 &&
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    noteIndex === data.pages[pageIndex].data.length - 1;

  if (isLastNote(pageIndex, noteIndex, data)) {
    return lastNoteRef;
  }

  return undefined;
};

export function fromNow(createdAt: Date | undefined) {
  if (!createdAt) {
    return undefined;
  }
  dayjs.extend(relativeTime);
  dayjs.extend(utc);
  dayjs.extend(timezone);
  const time = dayjs.utc(createdAt).tz(dayjs.tz.guess()).fromNow();
  return time;
}

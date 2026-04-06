type ShortcutEvent = Pick<
  KeyboardEvent,
  "altKey" | "code" | "ctrlKey" | "key" | "metaKey" | "shiftKey"
>;

function matchesShortcut(
  event: ShortcutEvent,
  {
    code,
    key,
    shift = false,
  }: {
    code: string;
    key: string;
    shift?: boolean;
  },
) {
  if (
    (!event.metaKey && !event.ctrlKey) ||
    event.altKey ||
    event.shiftKey !== shift
  ) {
    return false;
  }

  return event.code === code || event.key.toLowerCase() === key.toLowerCase();
}

export function isCommandPaletteShortcut(event: ShortcutEvent) {
  return matchesShortcut(event, { code: "KeyO", key: "o" });
}

export function isEditorFindShortcut(event: ShortcutEvent) {
  return matchesShortcut(event, { code: "KeyF", key: "f" });
}

export function isNotesSearchShortcut(event: ShortcutEvent) {
  return matchesShortcut(event, {
    code: "KeyF",
    key: "f",
    shift: true,
  });
}

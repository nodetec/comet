type ShortcutEvent = Pick<
  KeyboardEvent,
  "altKey" | "code" | "key" | "metaKey" | "shiftKey"
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
  if (!event.metaKey || event.altKey || event.shiftKey !== shift) {
    return false;
  }

  return event.code === code || event.key.toLowerCase() === key.toLowerCase();
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

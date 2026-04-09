type ShortcutEvent = Pick<
  KeyboardEvent,
  "altKey" | "code" | "ctrlKey" | "key" | "metaKey" | "shiftKey"
>;

export type PaneShortcutTarget = "sidebar" | "notes" | "editor";

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

export function isSidebarToggleShortcut(event: ShortcutEvent) {
  return matchesShortcut(event, { code: "KeyE", key: "e" });
}

export function isFocusModeShortcut(event: ShortcutEvent) {
  return matchesShortcut(event, { code: "KeyE", key: "e", shift: true });
}

export function isNotesSearchShortcut(event: ShortcutEvent) {
  return matchesShortcut(event, {
    code: "KeyF",
    key: "f",
    shift: true,
  });
}

export function getPaneFocusShortcut(
  event: ShortcutEvent,
): PaneShortcutTarget | null {
  if ((!event.metaKey && !event.ctrlKey) || event.altKey || event.shiftKey) {
    return null;
  }

  switch (event.code) {
    case "Digit1": {
      return "sidebar";
    }
    case "Digit2": {
      return "notes";
    }
    case "Digit3": {
      return "editor";
    }
    default: {
      return null;
    }
  }
}

import { useEffect, useEffectEvent, useState } from "react";
import { listen } from "@tauri-apps/api/event";

import { useShellStore } from "@/features/shell/store/use-shell-store";
import { useUIStore } from "@/features/settings/store/use-ui-store";
import {
  dispatchFocusEditor,
  dispatchFocusNotesPane,
} from "@/shared/lib/pane-navigation";
import {
  getPaneFocusShortcut,
  isCommandPaletteShortcut,
  isEditorFindShortcut,
  isFocusModeShortcut,
  isNotesSearchShortcut,
  isSidebarToggleShortcut,
} from "@/shared/lib/keyboard";

const TAURI_EVENT_COMMAND_PALETTE = "menu-command-palette";
const OPEN_EDITOR_FIND_EVENT = "comet:open-editor-find";
const TAURI_EVENT_EDITOR_FIND = "menu-editor-find";
const TAURI_EVENT_NEW_NOTE = "menu-new-note";
const TAURI_EVENT_NOTES_SEARCH = "menu-notes-search";
const TAURI_EVENT_SETTINGS = "menu-settings";

interface UseAppShortcutsOptions {
  onCreateNote: () => void;
}

export function useAppShortcuts({ onCreateNote }: UseAppShortcutsOptions) {
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [accountSwitcherOpen, setAccountSwitcherOpen] = useState(false);

  const setSettingsOpen = useUIStore((s) => s.setSettingsOpen);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const toggleFocusMode = useUIStore((s) => s.toggleFocusMode);
  const setFocusedPane = useShellStore((s) => s.setFocusedPane);

  const openCommandPalette = useEffectEvent(() => {
    setCommandPaletteOpen(true);
  });

  const focusNotesSearch = useEffectEvent(() => {
    window.dispatchEvent(new CustomEvent("comet:focus-search"));
  });

  const openEditorFind = useEffectEvent(() => {
    window.dispatchEvent(new CustomEvent(OPEN_EDITOR_FIND_EVENT));
  });

  const focusPane = useEffectEvent((pane: "sidebar" | "notes" | "editor") => {
    if (pane === "editor") {
      dispatchFocusEditor();
      return;
    }

    if (pane === "notes") {
      dispatchFocusNotesPane();
      return;
    }

    setFocusedPane(pane);
  });

  const handleKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (isCommandPaletteShortcut(event)) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      openCommandPalette();
      return;
    }

    if (isFocusModeShortcut(event)) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      toggleFocusMode();
      return;
    }

    if (isSidebarToggleShortcut(event)) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      if (useUIStore.getState().notesPanelVisible) {
        toggleSidebar();
      } else {
        toggleFocusMode();
      }
      return;
    }

    if (isNotesSearchShortcut(event)) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      focusNotesSearch();
      return;
    }

    if (isEditorFindShortcut(event)) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      openEditorFind();
      return;
    }

    const paneShortcut = getPaneFocusShortcut(event);
    if (paneShortcut) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      focusPane(paneShortcut);
      return;
    }

    if (event.metaKey && event.key.toLowerCase() === "s") {
      event.preventDefault();
      setAccountSwitcherOpen((open) => !open);
    }
  });

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, []);

  const handleCommandPaletteMenuEvent = useEffectEvent(() => {
    openCommandPalette();
  });

  const handleEditorFindMenuEvent = useEffectEvent(() => {
    openEditorFind();
  });

  const handleNewNoteMenuEvent = useEffectEvent(() => {
    onCreateNote();
  });

  const handleNotesSearchMenuEvent = useEffectEvent(() => {
    focusNotesSearch();
  });

  const handleSettingsMenuEvent = useEffectEvent(() => {
    setSettingsOpen(true);
  });

  useEffect(() => {
    let cancelled = false;
    const disposers: (() => void)[] = [];

    void Promise.all([
      listen(TAURI_EVENT_COMMAND_PALETTE, handleCommandPaletteMenuEvent),
      listen(TAURI_EVENT_EDITOR_FIND, handleEditorFindMenuEvent),
      listen(TAURI_EVENT_NEW_NOTE, handleNewNoteMenuEvent),
      listen(TAURI_EVENT_NOTES_SEARCH, handleNotesSearchMenuEvent),
      listen(TAURI_EVENT_SETTINGS, handleSettingsMenuEvent),
    ]).then((unlistenFns) => {
      if (cancelled) {
        for (const fn of unlistenFns) fn();
      } else {
        disposers.push(...unlistenFns);
      }
    });

    return () => {
      cancelled = true;
      for (const fn of disposers) fn();
    };
  }, []);

  return {
    accountSwitcherOpen,
    commandPaletteOpen,
    setAccountSwitcherOpen,
    setCommandPaletteOpen,
  };
}

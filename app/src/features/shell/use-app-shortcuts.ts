import { useEffect, useEffectEvent, useState } from "react";
import { listen } from "@tauri-apps/api/event";

import { useShellCommandStore } from "@/shared/stores/use-shell-command-store";
import { uiStore, useUIActions } from "@/features/settings/store/use-ui-store";
import { useShellNavigationStore } from "@/shared/stores/use-shell-navigation-store";
import {
  getPaneFocusShortcut,
  isCommandPaletteShortcut,
  isEditorFindShortcut,
  isFocusModeShortcut,
  isNotesSearchShortcut,
  isSidebarToggleShortcut,
} from "@/shared/lib/keyboard";

const TAURI_EVENT_COMMAND_PALETTE = "menu-command-palette";
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

  const { setSettingsOpen, toggleSidebar, toggleFocusMode } = useUIActions();
  const {
    requestFocusEditor,
    requestFocusNotesPane,
    requestFocusNotesSearch,
    requestOpenEditorFind,
  } = useShellCommandStore((state) => state.actions);
  const { setFocusedPane } = useShellNavigationStore((state) => state.actions);

  const openCommandPalette = useEffectEvent(() => {
    setCommandPaletteOpen(true);
  });

  const focusNotesSearch = useEffectEvent(() => {
    requestFocusNotesSearch();
  });

  const openEditorFind = useEffectEvent(() => {
    requestOpenEditorFind();
  });

  const focusPane = useEffectEvent((pane: "sidebar" | "notes" | "editor") => {
    if (pane === "editor") {
      requestFocusEditor();
      return;
    }

    if (pane === "notes") {
      requestFocusNotesPane();
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
      if (uiStore.getState().notesPanelVisible) {
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

import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { NoteSortDirection, NoteSortField } from "@/shared/api/types";

export type NoteSortPrefs = {
  field: NoteSortField;
  direction: NoteSortDirection;
};

export type SettingsTab =
  | "general"
  | "theme"
  | "editor"
  | "profile"
  | "sync"
  | "publish";

export const defaultNoteSortPrefs: NoteSortPrefs = {
  field: "modified_at",
  direction: "newest",
};

type UIStore = {
  showEditorToolbar: boolean;
  setShowEditorToolbar(show: boolean): void;

  settingsOpen: boolean;
  setSettingsOpen(open: boolean): void;

  settingsTab: SettingsTab;
  setSettingsTab(tab: SettingsTab): void;

  editorFontSize: number;
  setEditorFontSize(size: number): void;

  editorSpellCheck: boolean;
  setEditorSpellCheck(enabled: boolean): void;

  editorVimMode: boolean;
  setEditorVimMode(enabled: boolean): void;

  noteSortPrefs: Record<string, NoteSortPrefs>;
  setNoteSortPrefs(viewKey: string, prefs: Partial<NoteSortPrefs>): void;

  expandedSidebarTagPaths: string[];
  setExpandedSidebarTagPaths(paths: string[]): void;

  sidebarNotesChildrenOpen: boolean;
  setSidebarNotesChildrenOpen(open: boolean): void;

  themeName: string | null;
  setThemeName(name: string | null): void;
};

export const useUIStore = create<UIStore>()(
  persist(
    (set) => ({
      showEditorToolbar: false,
      setShowEditorToolbar: (showEditorToolbar) => {
        set({ showEditorToolbar });
      },

      settingsOpen: false,
      setSettingsOpen: (settingsOpen) => {
        set({ settingsOpen });
      },

      settingsTab: "general",
      setSettingsTab: (settingsTab) => {
        set({ settingsTab });
      },

      editorFontSize: 15,
      setEditorFontSize: (editorFontSize) => {
        set({ editorFontSize: Math.min(20, Math.max(12, editorFontSize)) });
      },

      editorSpellCheck: false,
      setEditorSpellCheck: (editorSpellCheck) => {
        set({ editorSpellCheck });
      },

      editorVimMode: false,
      setEditorVimMode: (editorVimMode) => {
        set({ editorVimMode });
      },

      themeName: null,
      setThemeName: (themeName) => {
        set({ themeName });
      },

      noteSortPrefs: {},
      setNoteSortPrefs: (viewKey, prefs) => {
        set((state) => {
          const current = state.noteSortPrefs[viewKey] ?? defaultNoteSortPrefs;
          const next = { ...current, ...prefs };
          if (
            next.field === current.field &&
            next.direction === current.direction
          ) {
            return state;
          }
          return {
            noteSortPrefs: { ...state.noteSortPrefs, [viewKey]: next },
          };
        });
      },

      expandedSidebarTagPaths: [],
      setExpandedSidebarTagPaths: (expandedSidebarTagPaths) => {
        set({ expandedSidebarTagPaths });
      },

      sidebarNotesChildrenOpen: true,
      setSidebarNotesChildrenOpen: (sidebarNotesChildrenOpen) => {
        set({ sidebarNotesChildrenOpen });
      },
    }),
    {
      name: "comet-ui",
      partialize: (state) => ({
        showEditorToolbar: state.showEditorToolbar,
        editorFontSize: state.editorFontSize,
        editorSpellCheck: state.editorSpellCheck,
        editorVimMode: state.editorVimMode,
        themeName: state.themeName,
        noteSortPrefs: state.noteSortPrefs,
        expandedSidebarTagPaths: state.expandedSidebarTagPaths,
        sidebarNotesChildrenOpen: state.sidebarNotesChildrenOpen,
      }),
    },
  ),
);

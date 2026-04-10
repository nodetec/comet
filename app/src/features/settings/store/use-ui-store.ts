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

type UIActions = {
  setShowEditorToolbar(show: boolean): void;
  setSettingsOpen(open: boolean): void;
  setSettingsTab(tab: SettingsTab): void;
  setEditorFontSize(size: number): void;
  setEditorSpellCheck(enabled: boolean): void;
  setEditorVimMode(enabled: boolean): void;
  setNoteSortPrefs(viewKey: string, prefs: Partial<NoteSortPrefs>): void;
  setExpandedSidebarTagPaths(paths: string[]): void;
  toggleSidebar(): void;
  toggleFocusMode(): void;
  setSidebarNotesChildrenOpen(open: boolean): void;
  setThemeName(name: string | null): void;
};

type UIState = {
  showEditorToolbar: boolean;
  settingsOpen: boolean;
  settingsTab: SettingsTab;
  editorFontSize: number;
  editorSpellCheck: boolean;
  editorVimMode: boolean;
  noteSortPrefs: Record<string, NoteSortPrefs>;
  expandedSidebarTagPaths: string[];
  sidebarVisible: boolean;
  notesPanelVisible: boolean;
  sidebarNotesChildrenOpen: boolean;
  themeName: string | null;
  actions: UIActions;
};

const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      showEditorToolbar: false,
      settingsOpen: false,
      settingsTab: "general",
      editorFontSize: 15,
      editorSpellCheck: false,
      editorVimMode: false,
      themeName: null,
      noteSortPrefs: {},
      expandedSidebarTagPaths: [],
      sidebarVisible: true,
      notesPanelVisible: true,
      sidebarNotesChildrenOpen: true,
      actions: {
        setShowEditorToolbar: (showEditorToolbar) => {
          set({ showEditorToolbar });
        },
        setSettingsOpen: (settingsOpen) => {
          set({ settingsOpen });
        },
        setSettingsTab: (settingsTab) => {
          set({ settingsTab });
        },
        setEditorFontSize: (editorFontSize) => {
          set({ editorFontSize: Math.min(20, Math.max(12, editorFontSize)) });
        },
        setEditorSpellCheck: (editorSpellCheck) => {
          set({ editorSpellCheck });
        },
        setEditorVimMode: (editorVimMode) => {
          set({ editorVimMode });
        },
        setThemeName: (themeName) => {
          set({ themeName });
        },
        setNoteSortPrefs: (viewKey, prefs) => {
          set((state) => {
            const current =
              state.noteSortPrefs[viewKey] ?? defaultNoteSortPrefs;
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
        setExpandedSidebarTagPaths: (expandedSidebarTagPaths) => {
          set({ expandedSidebarTagPaths });
        },
        toggleSidebar: () => {
          set((state) => ({ sidebarVisible: !state.sidebarVisible }));
        },
        toggleFocusMode: () => {
          set((state) => {
            const entering = state.sidebarVisible || state.notesPanelVisible;
            return entering
              ? { sidebarVisible: false, notesPanelVisible: false }
              : { sidebarVisible: true, notesPanelVisible: true };
          });
        },
        setSidebarNotesChildrenOpen: (sidebarNotesChildrenOpen) => {
          set({ sidebarNotesChildrenOpen });
        },
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
        sidebarVisible: state.sidebarVisible,
        notesPanelVisible: state.notesPanelVisible,
        noteSortPrefs: state.noteSortPrefs,
        expandedSidebarTagPaths: state.expandedSidebarTagPaths,
        sidebarNotesChildrenOpen: state.sidebarNotesChildrenOpen,
      }),
    },
  ),
);

// --- Public API ---

/** Raw store for imperative `getState()` / `setState()` / `subscribe()` access. */
export const uiStore = useUIStore;

/** Returns all actions (stable reference, never causes re-render). */
export const useUIActions = () => useUIStore((s) => s.actions);

// --- Atomic state hooks ---

export const useShowEditorToolbar = () =>
  useUIStore((s) => s.showEditorToolbar);
export const useSettingsOpen = () => useUIStore((s) => s.settingsOpen);
export const useSettingsTab = () => useUIStore((s) => s.settingsTab);
export const useEditorFontSize = () => useUIStore((s) => s.editorFontSize);
export const useEditorSpellCheck = () => useUIStore((s) => s.editorSpellCheck);
export const useEditorVimMode = () => useUIStore((s) => s.editorVimMode);
export const useNoteSortPrefs = () => useUIStore((s) => s.noteSortPrefs);
export const useExpandedSidebarTagPaths = () =>
  useUIStore((s) => s.expandedSidebarTagPaths);
export const useSidebarVisible = () => useUIStore((s) => s.sidebarVisible);
export const useNotesPanelVisible = () =>
  useUIStore((s) => s.notesPanelVisible);
export const useSidebarNotesChildrenOpen = () =>
  useUIStore((s) => s.sidebarNotesChildrenOpen);
export const useThemeName = () => useUIStore((s) => s.themeName);

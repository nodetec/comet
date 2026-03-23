import { create } from 'zustand';
import type { NoteFilter, NoteSortField, NoteSortDirection } from '../api/types';

type ShellStore = {
  selectedNoteId: string | null;
  noteFilter: NoteFilter;
  activeNotebookId: string | null;
  activeTags: string[];
  searchQuery: string;
  sortField: NoteSortField;
  sortDirection: NoteSortDirection;

  selectNote: (noteId: string | null) => void;
  setNoteFilter: (filter: NoteFilter) => void;
  setActiveNotebookId: (id: string | null) => void;
  setActiveTags: (tags: string[]) => void;
  toggleTag: (tag: string) => void;
  setSearchQuery: (query: string) => void;
  setSortField: (field: NoteSortField) => void;
  setSortDirection: (direction: NoteSortDirection) => void;
  reset: () => void;
};

const initialState = {
  selectedNoteId: null as string | null,
  noteFilter: 'all' as NoteFilter,
  activeNotebookId: null as string | null,
  activeTags: [] as string[],
  searchQuery: '',
  sortField: 'modifiedAt' as NoteSortField,
  sortDirection: 'newest' as NoteSortDirection,
};

export const useShellStore = create<ShellStore>()((set) => ({
  ...initialState,

  selectNote: (noteId) => set({ selectedNoteId: noteId }),

  setNoteFilter: (filter) =>
    set({
      noteFilter: filter,
      activeNotebookId: filter === 'notebook' ? undefined : null,
      activeTags: [],
      searchQuery: '',
    }),

  setActiveNotebookId: (id) =>
    set({ activeNotebookId: id, noteFilter: 'notebook' }),

  setActiveTags: (tags) => set({ activeTags: tags }),

  toggleTag: (tag) =>
    set((state) => ({
      activeTags: state.activeTags.includes(tag)
        ? state.activeTags.filter((t) => t !== tag)
        : [...state.activeTags, tag],
    })),

  setSearchQuery: (query) => set({ searchQuery: query }),
  setSortField: (field) => set({ sortField: field }),
  setSortDirection: (direction) => set({ sortDirection: direction }),
  reset: () => set(initialState),
}));

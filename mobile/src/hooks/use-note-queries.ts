import {
  useQuery,
  useInfiniteQuery,
  type UseQueryResult,
} from '@tanstack/react-query';
import {
  getBootstrap,
  queryNotes,
  getContextualTags,
  loadNote,
} from '../api/bridge';
import type {
  BootstrapPayload,
  NotePagePayload,
  ContextualTagsPayload,
  LoadedNote,
  NoteFilter,
  NoteSortField,
  NoteSortDirection,
} from '../api/types';

export function useBootstrap(): UseQueryResult<BootstrapPayload> {
  return useQuery({
    queryKey: ['bootstrap'],
    queryFn: () => getBootstrap(),
    staleTime: Infinity,
  });
}

export function useNotesQuery(params: {
  noteFilter: NoteFilter;
  activeNotebookId: string | null;
  searchQuery: string;
  activeTags: string[];
  sortField: NoteSortField;
  sortDirection: NoteSortDirection;
}) {
  return useInfiniteQuery({
    queryKey: ['notes', params],
    queryFn: ({ pageParam = 0 }) =>
      queryNotes({
        noteFilter: params.noteFilter,
        activeNotebookId: params.activeNotebookId,
        searchQuery: params.searchQuery,
        activeTags: params.activeTags,
        limit: 40,
        offset: pageParam as number,
        sortField: params.sortField,
        sortDirection: params.sortDirection,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage: NotePagePayload) =>
      lastPage.hasMore ? lastPage.nextOffset : undefined,
  });
}

export function useContextualTags(params: {
  noteFilter: NoteFilter;
  activeNotebookId: string | null;
}): UseQueryResult<ContextualTagsPayload> {
  return useQuery({
    queryKey: ['contextual-tags', params],
    queryFn: () =>
      getContextualTags({
        noteFilter: params.noteFilter,
        activeNotebookId: params.activeNotebookId,
      }),
  });
}

export function useNote(
  noteId: string | null,
): UseQueryResult<LoadedNote | null> {
  return useQuery({
    queryKey: ['note', noteId],
    queryFn: () => (noteId ? loadNote(noteId) : null),
    enabled: !!noteId,
  });
}

import { useMemo } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";

import {
  getBootstrap,
  getContextualTags,
  getNoteConflict,
  getTodoCount,
  loadNote,
  NOTE_PAGE_SIZE,
  queryNotes,
} from "@/shared/api/invoke";
import {
  type NoteFilter,
  type NoteQueryInput,
  type NoteSortDirection,
  type NoteSortField,
} from "@/shared/api/types";
import { flattenNotePages } from "@/features/shell/utils";

const EMPTY_TAGS: string[] = [];

export interface NoteQueryParams {
  noteFilter: NoteFilter;
  activeTags: string[];
  searchQuery: string;
  sortField: NoteSortField;
  sortDirection: NoteSortDirection;
  selectedNoteId: string | null;
}

export function useNoteQueries(params: NoteQueryParams) {
  const {
    noteFilter,
    activeTags,
    searchQuery,
    sortField,
    sortDirection,
    selectedNoteId,
  } = params;

  const normalizedQuery = searchQuery.trim();
  const normalizedActiveTags = useMemo(
    // eslint-disable-next-line unicorn/no-array-sort -- app tsconfig targets ES2020, so toSorted() is unavailable here
    () => [...activeTags].sort((left, right) => left.localeCompare(right)),
    [activeTags],
  );

  const bootstrapQuery = useQuery({
    queryKey: ["bootstrap"],
    queryFn: getBootstrap,
  });
  const activeNpub = bootstrapQuery.data?.npub ?? null;

  const todoCountQuery = useQuery({
    queryKey: ["todo-count"],
    queryFn: getTodoCount,
    enabled: bootstrapQuery.isSuccess,
  });

  const initialSelectedNoteId = bootstrapQuery.data?.selectedNoteId ?? null;
  const isDefaultNotesView =
    noteFilter === "all" &&
    normalizedQuery === "" &&
    normalizedActiveTags.length === 0 &&
    sortField === "modified_at" &&
    sortDirection === "newest";

  const notesQueryInput = useMemo<NoteQueryInput>(
    () => ({
      activeTags: normalizedActiveTags,
      limit: NOTE_PAGE_SIZE,
      noteFilter,
      offset: 0,
      searchQuery: normalizedQuery,
      sortField,
      sortDirection,
    }),
    [
      normalizedActiveTags,
      normalizedQuery,
      noteFilter,
      sortField,
      sortDirection,
    ],
  );

  const notesQueryKey = useMemo(
    () => ["notes", notesQueryInput] as const,
    [notesQueryInput],
  );

  const notesQuery = useInfiniteQuery({
    queryKey: notesQueryKey,
    queryFn: ({ pageParam }) =>
      queryNotes({
        ...notesQueryInput,
        offset: pageParam,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextOffset ?? undefined,
    initialData:
      isDefaultNotesView && bootstrapQuery.data
        ? {
            pageParams: [0],
            pages: [bootstrapQuery.data.initialNotes],
          }
        : undefined,
    placeholderData: (previousData) => previousData,
    enabled: bootstrapQuery.isSuccess,
  });

  const currentNotes = useMemo(
    () => flattenNotePages(notesQuery.data),
    [notesQuery.data],
  );
  const totalNoteCount = notesQuery.data?.pages[0]?.totalCount ?? 0;

  const contextualTagsQuery = useQuery({
    enabled: bootstrapQuery.isSuccess,
    initialData:
      noteFilter === "all" && bootstrapQuery.data
        ? bootstrapQuery.data.initialTags
        : undefined,
    placeholderData: (previousData) => previousData,
    queryFn: () => getContextualTags({ noteFilter }),
    queryKey: ["contextual-tags", noteFilter],
  });
  const availableTags = contextualTagsQuery.data?.tags ?? EMPTY_TAGS;

  const noteQuery = useQuery({
    enabled: Boolean(selectedNoteId),
    placeholderData: (previousData) => previousData,
    queryFn: () => loadNote(selectedNoteId!),
    queryKey: ["note", selectedNoteId],
  });

  const noteConflictQuery = useQuery({
    enabled: Boolean(selectedNoteId),
    queryFn: () => getNoteConflict(selectedNoteId!),
    queryKey: ["note-conflict", selectedNoteId],
  });

  return {
    bootstrapQuery,
    todoCountQuery,
    notesQuery,
    noteQuery,
    contextualTagsQuery,
    currentNotes,
    availableTags,
    totalNoteCount,
    activeNpub,
    initialSelectedNoteId,
    noteConflictQuery,
  };
}

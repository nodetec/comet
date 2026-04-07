import { useMemo } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";

import {
  getBootstrap,
  getNoteBacklinks,
  getContextualTags,
  getNoteConflict,
  getNoteHistory,
  getTodoCount,
  loadNote,
  NOTE_PAGE_SIZE,
  queryNotes,
} from "@/shared/api/invoke";
import {
  type ContextualTagNode,
  type NoteFilter,
  type NoteQueryInput,
  type NoteSortDirection,
  type NoteSortField,
} from "@/shared/api/types";
import { flattenNotePages } from "@/features/shell/utils";

const EMPTY_TAG_TREE: ContextualTagNode[] = [];

function flattenTagPaths(nodes: ContextualTagNode[]): string[] {
  const paths: string[] = [];

  const visit = (tagNodes: ContextualTagNode[]) => {
    for (const node of tagNodes) {
      paths.push(node.path);
      visit(node.children);
    }
  };

  visit(nodes);

  return paths;
}

export interface NoteQueryParams {
  noteFilter: NoteFilter;
  activeTagPath: string | null;
  tagViewActive: boolean;
  searchQuery: string;
  sortField: NoteSortField;
  sortDirection: NoteSortDirection;
  selectedNoteId: string | null;
}

export function useNoteQueries(params: NoteQueryParams) {
  const {
    noteFilter,
    activeTagPath,
    tagViewActive,
    searchQuery,
    sortField,
    sortDirection,
    selectedNoteId,
  } = params;

  const normalizedQuery = searchQuery.trim();
  const normalizedActiveTagPath = activeTagPath?.trim() || null;
  const effectiveNoteFilter = tagViewActive ? "all" : noteFilter;
  const effectiveActiveTagPath = tagViewActive ? normalizedActiveTagPath : null;

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
    effectiveNoteFilter === "all" &&
    normalizedQuery === "" &&
    effectiveActiveTagPath === null &&
    sortField === "modified_at" &&
    sortDirection === "newest";

  const notesQueryInput = useMemo<NoteQueryInput>(
    () => ({
      activeTagPath: effectiveActiveTagPath,
      limit: NOTE_PAGE_SIZE,
      noteFilter: effectiveNoteFilter,
      offset: 0,
      searchQuery: normalizedQuery,
      sortField,
      sortDirection,
    }),
    [
      effectiveActiveTagPath,
      effectiveNoteFilter,
      normalizedQuery,
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
    initialData: bootstrapQuery.data?.initialTags,
    placeholderData: (previousData) => previousData,
    queryFn: () => getContextualTags({ noteFilter: "all" }),
    queryKey: ["contextual-tags"],
  });
  const availableTagTree = contextualTagsQuery.data?.roots ?? EMPTY_TAG_TREE;
  const availableTagPaths = useMemo(
    () => flattenTagPaths(availableTagTree),
    [availableTagTree],
  );

  const noteQuery = useQuery({
    enabled: Boolean(selectedNoteId),
    placeholderData: selectedNoteId
      ? (previousData) => previousData
      : undefined,
    queryFn: () => loadNote(selectedNoteId!),
    queryKey: ["note", selectedNoteId],
  });

  const noteConflictQuery = useQuery({
    enabled: Boolean(selectedNoteId),
    queryFn: () => getNoteConflict(selectedNoteId!),
    queryKey: ["note-conflict", selectedNoteId],
  });

  const noteHistoryQuery = useQuery({
    enabled: Boolean(selectedNoteId),
    queryFn: () => getNoteHistory(selectedNoteId!),
    queryKey: ["note-history", selectedNoteId],
  });

  const noteBacklinksQuery = useQuery({
    enabled: Boolean(selectedNoteId),
    queryFn: () => getNoteBacklinks(selectedNoteId!),
    queryKey: ["note-backlinks", selectedNoteId],
  });

  return {
    bootstrapQuery,
    todoCountQuery,
    notesQuery,
    noteQuery,
    contextualTagsQuery,
    currentNotes,
    availableTagPaths,
    availableTagTree,
    totalNoteCount,
    activeNpub,
    initialSelectedNoteId,
    noteConflictQuery,
    noteHistoryQuery,
    noteBacklinksQuery,
  };
}

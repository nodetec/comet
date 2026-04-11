import { create } from "zustand";

import {
  extractWikiLinkOccurrences,
  normalizeWikiLinkTitle,
} from "@/features/editor/lib/wikilinks";
import type { WikiLinkResolutionInput } from "@/shared/api/types";

function groupWikiLinkOccurrencesByTitle(markdown: string) {
  const occurrencesByTitle = new Map<
    string,
    { location: number; title: string }[]
  >();

  for (const occurrence of extractWikiLinkOccurrences(markdown)) {
    const normalizedTitle = normalizeWikiLinkTitle(occurrence.title);
    if (!normalizedTitle) {
      continue;
    }

    const existing = occurrencesByTitle.get(normalizedTitle);
    if (existing) {
      existing.push(occurrence);
    } else {
      occurrencesByTitle.set(normalizedTitle, [occurrence]);
    }
  }

  return occurrencesByTitle;
}

function sortWikilinkResolutions(
  resolutions: WikiLinkResolutionInput[],
): WikiLinkResolutionInput[] {
  // eslint-disable-next-line unicorn/no-array-sort -- app tsconfig target doesn't include toSorted()
  return [...resolutions].sort((left, right) => left.location - right.location);
}

function matchesResolutionIdentity(
  left: WikiLinkResolutionInput,
  right: WikiLinkResolutionInput,
): boolean {
  if (left.occurrenceId && right.occurrenceId) {
    return left.occurrenceId === right.occurrenceId;
  }

  return (
    left.location === right.location &&
    left.title === right.title &&
    left.targetNoteId === right.targetNoteId
  );
}

function replaceableResolutionSlotMatches(
  entry: WikiLinkResolutionInput,
  resolution: WikiLinkResolutionInput,
): boolean {
  return (
    (entry.occurrenceId &&
      resolution.occurrenceId &&
      entry.occurrenceId === resolution.occurrenceId) ||
    (entry.location === resolution.location && entry.title === resolution.title)
  );
}

function removeMatchingWikilinkResolutions(
  entries: WikiLinkResolutionInput[],
  resolutions: WikiLinkResolutionInput[],
): WikiLinkResolutionInput[] {
  return entries.filter(
    (entry) =>
      !resolutions.some((resolution) =>
        matchesResolutionIdentity(entry, resolution),
      ),
  );
}

function remapResolutionForUpdatedMarkdown(
  resolution: WikiLinkResolutionInput,
  previousOccurrencesByTitle: Map<
    string,
    { location: number; title: string }[]
  >,
  nextOccurrencesByTitle: Map<string, { location: number; title: string }[]>,
): WikiLinkResolutionInput | null {
  const normalizedTitle = normalizeWikiLinkTitle(resolution.title);
  if (!normalizedTitle) {
    return null;
  }

  if (!resolution.occurrenceId) {
    const nextOccurrence = (
      nextOccurrencesByTitle.get(normalizedTitle) ?? []
    ).find((occurrence) => occurrence.location === resolution.location);

    return nextOccurrence
      ? { ...resolution, title: nextOccurrence.title }
      : null;
  }

  const previousOccurrences =
    previousOccurrencesByTitle.get(normalizedTitle) ?? [];
  const nextOccurrences = nextOccurrencesByTitle.get(normalizedTitle) ?? [];

  const locationMatch = nextOccurrences.find(
    (occurrence) => occurrence.location === resolution.location,
  );
  if (locationMatch) {
    return {
      ...resolution,
      location: locationMatch.location,
      title: locationMatch.title,
    };
  }

  if (
    previousOccurrences.length > 0 &&
    previousOccurrences.length === nextOccurrences.length
  ) {
    const occurrenceIndex = previousOccurrences.findIndex(
      (occurrence) => occurrence.location === resolution.location,
    );
    const nextOccurrence =
      occurrenceIndex === -1 ? undefined : nextOccurrences[occurrenceIndex];
    if (nextOccurrence) {
      return {
        ...resolution,
        location: nextOccurrence.location,
        title: nextOccurrence.title,
      };
    }
  }

  return null;
}

function preserveWikilinkResolutionsForDraft(
  previousMarkdown: string,
  nextMarkdown: string,
  resolutions: WikiLinkResolutionInput[],
): WikiLinkResolutionInput[] {
  const previousOccurrencesByTitle =
    groupWikiLinkOccurrencesByTitle(previousMarkdown);
  const nextOccurrencesByTitle = groupWikiLinkOccurrencesByTitle(nextMarkdown);

  return sortWikilinkResolutions(
    resolutions.flatMap((resolution) => {
      const remappedResolution = remapResolutionForUpdatedMarkdown(
        resolution,
        previousOccurrencesByTitle,
        nextOccurrencesByTitle,
      );
      return remappedResolution ? [remappedResolution] : [];
    }),
  );
}

export type DraftActions = {
  clearDraftWikilinkResolutions(noteId?: string): void;
  removeDraftWikilinkResolutions(
    noteId: string,
    resolutions: WikiLinkResolutionInput[],
  ): void;
  setDraft(
    noteId: string,
    markdown: string,
    options?: {
      preserveWikilinkResolutions?: boolean;
      wikilinkResolutions?: WikiLinkResolutionInput[];
    },
  ): void;
  upsertDraftWikilinkResolution(
    noteId: string,
    resolution: WikiLinkResolutionInput,
  ): void;
};

export type DraftState = {
  draftMarkdown: string;
  draftNoteId: string | null;
  draftWikilinkResolutions: WikiLinkResolutionInput[];
  actions: DraftActions;
};

export const EMPTY_DRAFT_STATE = {
  draftMarkdown: "",
  draftNoteId: null,
  draftWikilinkResolutions: [],
} satisfies Pick<
  DraftState,
  "draftMarkdown" | "draftNoteId" | "draftWikilinkResolutions"
>;

export function resetShellDraftState() {
  useShellDraftStore.setState(EMPTY_DRAFT_STATE);
}

const useShellDraftStore = create<DraftState>((set) => ({
  ...EMPTY_DRAFT_STATE,
  actions: {
    clearDraftWikilinkResolutions: (noteId) => {
      set((state) => {
        if (noteId && state.draftNoteId !== noteId) {
          return state;
        }
        return { draftWikilinkResolutions: [] };
      });
    },
    removeDraftWikilinkResolutions: (noteId, resolutions) => {
      set((state) => {
        if (state.draftNoteId !== noteId || resolutions.length === 0) {
          return state;
        }

        return {
          draftWikilinkResolutions: removeMatchingWikilinkResolutions(
            state.draftWikilinkResolutions,
            resolutions,
          ),
        };
      });
    },
    setDraft: (noteId, markdown, options) => {
      set((state) => {
        let nextResolutions: WikiLinkResolutionInput[] = [];

        if (options?.wikilinkResolutions !== undefined) {
          nextResolutions = [...options.wikilinkResolutions];
        } else if (
          options?.preserveWikilinkResolutions &&
          state.draftNoteId === noteId
        ) {
          nextResolutions = preserveWikilinkResolutionsForDraft(
            state.draftMarkdown,
            markdown,
            state.draftWikilinkResolutions,
          );
        }

        return {
          draftMarkdown: markdown,
          draftNoteId: noteId,
          draftWikilinkResolutions: nextResolutions,
        };
      });
    },
    upsertDraftWikilinkResolution: (noteId, resolution) => {
      set((state) => {
        if (state.draftNoteId !== noteId) {
          console.warn("[wikilinks] skipped draft wikilink resolution upsert", {
            draftNoteId: state.draftNoteId,
            noteId,
            resolution,
          });
          return state;
        }

        const nextResolutions = state.draftWikilinkResolutions.filter(
          (entry) => !replaceableResolutionSlotMatches(entry, resolution),
        );
        nextResolutions.push(resolution);

        console.debug("[wikilinks] stored draft wikilink resolution", {
          draftNoteId: state.draftNoteId,
          resolution,
          resolutionCount: nextResolutions.length,
        });

        return {
          draftWikilinkResolutions: sortWikilinkResolutions(nextResolutions),
        };
      });
    },
  },
}));

export { useShellDraftStore };

import { afterEach, describe, expect, it } from "vitest";

import { shellStore } from "@/shared/stores/use-shell-store";

describe("shellStore wikilink resolution reconciliation", () => {
  afterEach(() => {
    shellStore.setState({
      draftMarkdown: "",
      draftNoteId: null,
      draftWikilinkResolutions: [],
    });
  });

  it("removes only submitted wikilink resolutions for the active draft", () => {
    shellStore.setState({
      draftMarkdown: "[[Alpha]] [[Beta]]",
      draftNoteId: "note-1",
      draftWikilinkResolutions: [
        {
          occurrenceId: "A1",
          location: 0,
          targetNoteId: "target-a",
          title: "Alpha",
        },
        {
          occurrenceId: "B2",
          location: 10,
          targetNoteId: "target-b",
          title: "Beta",
        },
      ],
    });

    shellStore.getState().actions.removeDraftWikilinkResolutions("note-1", [
      {
        occurrenceId: "A1",
        location: 0,
        targetNoteId: "target-a",
        title: "Alpha",
      },
    ]);

    expect(shellStore.getState().draftWikilinkResolutions).toEqual([
      {
        occurrenceId: "B2",
        location: 10,
        targetNoteId: "target-b",
        title: "Beta",
      },
    ]);
  });

  it("does not drop a newer replacement without occurrence ids", () => {
    shellStore.setState({
      draftMarkdown: "[[Alpha]]",
      draftNoteId: "note-1",
      draftWikilinkResolutions: [
        {
          location: 0,
          targetNoteId: "target-new",
          title: "Alpha",
        },
      ],
    });

    shellStore.getState().actions.removeDraftWikilinkResolutions("note-1", [
      {
        location: 0,
        targetNoteId: "target-old",
        title: "Alpha",
      },
    ]);

    expect(shellStore.getState().draftWikilinkResolutions).toEqual([
      {
        location: 0,
        targetNoteId: "target-new",
        title: "Alpha",
      },
    ]);
  });

  it("clears same-note wikilink resolutions on authoritative draft replacement", () => {
    shellStore.setState({
      draftMarkdown: "[[Alpha]]",
      draftNoteId: "note-1",
      draftWikilinkResolutions: [
        {
          occurrenceId: "A1",
          location: 0,
          targetNoteId: "target-a",
          title: "Alpha",
        },
      ],
    });

    shellStore.getState().actions.setDraft("note-1", "# Refreshed markdown");

    expect(shellStore.getState().draftWikilinkResolutions).toEqual([]);
  });

  it("hydrates authoritative wikilink resolutions on draft replacement", () => {
    shellStore.setState({
      draftMarkdown: "# Old",
      draftNoteId: "note-1",
      draftWikilinkResolutions: [],
    });

    shellStore.getState().actions.setDraft("note-1", "# Loaded\n\n[[Alpha]]", {
      wikilinkResolutions: [
        {
          occurrenceId: "A1",
          location: 10,
          targetNoteId: "target-a",
          title: "Alpha",
        },
      ],
    });

    expect(shellStore.getState().draftWikilinkResolutions).toEqual([
      {
        occurrenceId: "A1",
        location: 10,
        targetNoteId: "target-a",
        title: "Alpha",
      },
    ]);
  });

  it("preserves same-note wikilink resolutions for live draft edits when requested", () => {
    shellStore.setState({
      draftMarkdown: "[[Alpha]]",
      draftNoteId: "note-1",
      draftWikilinkResolutions: [
        {
          occurrenceId: "A1",
          location: 0,
          targetNoteId: "target-a",
          title: "Alpha",
        },
      ],
    });

    shellStore.getState().actions.setDraft("note-1", "x [[Alpha]] more", {
      preserveWikilinkResolutions: true,
    });

    expect(shellStore.getState().draftWikilinkResolutions).toEqual([
      {
        occurrenceId: "A1",
        location: 2,
        targetNoteId: "target-a",
        title: "Alpha",
      },
    ]);
  });

  it("preserves duplicate-title wikilink resolutions by occurrence id when positions shift", () => {
    shellStore.setState({
      draftMarkdown: "[[Alpha]] [[Alpha]]",
      draftNoteId: "note-1",
      draftWikilinkResolutions: [
        {
          occurrenceId: "B2",
          location: 10,
          targetNoteId: "target-b",
          title: "Alpha",
        },
      ],
    });

    shellStore.getState().actions.setDraft("note-1", "x [[Alpha]] [[Alpha]]", {
      preserveWikilinkResolutions: true,
    });

    expect(shellStore.getState().draftWikilinkResolutions).toEqual([
      {
        occurrenceId: "B2",
        location: 12,
        targetNoteId: "target-b",
        title: "Alpha",
      },
    ]);
  });

  it("preserves duplicate-title wikilink resolutions at stable locations when occurrence count changes", () => {
    shellStore.setState({
      draftMarkdown: "[[Alpha]] [[Alpha]]",
      draftNoteId: "note-1",
      draftWikilinkResolutions: [
        {
          occurrenceId: "B2",
          location: 10,
          targetNoteId: "target-b",
          title: "Alpha",
        },
      ],
    });

    shellStore
      .getState()
      .actions.setDraft("note-1", "[[Alpha]] [[Alpha]] [[Alpha]]", {
        preserveWikilinkResolutions: true,
      });

    expect(shellStore.getState().draftWikilinkResolutions).toEqual([
      {
        occurrenceId: "B2",
        location: 10,
        targetNoteId: "target-b",
        title: "Alpha",
      },
    ]);
  });

  it("preserves resolved wikilinks when only title casing changes", () => {
    shellStore.setState({
      draftMarkdown: "[[Project Alpha]]",
      draftNoteId: "note-1",
      draftWikilinkResolutions: [
        {
          occurrenceId: "A1",
          location: 0,
          targetNoteId: "target-a",
          title: "Project Alpha",
        },
      ],
    });

    shellStore.getState().actions.setDraft("note-1", "[[project   alpha]]", {
      preserveWikilinkResolutions: true,
    });

    expect(shellStore.getState().draftWikilinkResolutions).toEqual([
      {
        occurrenceId: "A1",
        location: 0,
        targetNoteId: "target-a",
        title: "project   alpha",
      },
    ]);
  });
});

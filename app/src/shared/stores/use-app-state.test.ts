import { afterEach, describe, expect, it } from "vitest";

import { appStore } from "@/shared/stores/use-app-state";

describe("appStore wikilink resolution reconciliation", () => {
  afterEach(() => {
    appStore.setState({
      draftMarkdown: "",
      draftNoteId: null,
      draftWikilinkResolutions: [],
    });
  });

  it("removes only submitted wikilink resolutions for the active draft", () => {
    appStore.setState({
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

    appStore.getState().actions.removeDraftWikilinkResolutions("note-1", [
      {
        occurrenceId: "A1",
        location: 0,
        targetNoteId: "target-a",
        title: "Alpha",
      },
    ]);

    expect(appStore.getState().draftWikilinkResolutions).toEqual([
      {
        occurrenceId: "B2",
        location: 10,
        targetNoteId: "target-b",
        title: "Beta",
      },
    ]);
  });

  it("does not drop a newer replacement without occurrence ids", () => {
    appStore.setState({
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

    appStore.getState().actions.removeDraftWikilinkResolutions("note-1", [
      {
        location: 0,
        targetNoteId: "target-old",
        title: "Alpha",
      },
    ]);

    expect(appStore.getState().draftWikilinkResolutions).toEqual([
      {
        location: 0,
        targetNoteId: "target-new",
        title: "Alpha",
      },
    ]);
  });

  it("clears same-note wikilink resolutions on authoritative draft replacement", () => {
    appStore.setState({
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

    appStore.getState().actions.setDraft("note-1", "# Refreshed markdown");

    expect(appStore.getState().draftWikilinkResolutions).toEqual([]);
  });

  it("hydrates authoritative wikilink resolutions on draft replacement", () => {
    appStore.setState({
      draftMarkdown: "# Old",
      draftNoteId: "note-1",
      draftWikilinkResolutions: [],
    });

    appStore.getState().actions.setDraft("note-1", "# Loaded\n\n[[Alpha]]", {
      wikilinkResolutions: [
        {
          occurrenceId: "A1",
          location: 10,
          targetNoteId: "target-a",
          title: "Alpha",
        },
      ],
    });

    expect(appStore.getState().draftWikilinkResolutions).toEqual([
      {
        occurrenceId: "A1",
        location: 10,
        targetNoteId: "target-a",
        title: "Alpha",
      },
    ]);
  });

  it("preserves same-note wikilink resolutions for live draft edits when requested", () => {
    appStore.setState({
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

    appStore.getState().actions.setDraft("note-1", "x [[Alpha]] more", {
      preserveWikilinkResolutions: true,
    });

    expect(appStore.getState().draftWikilinkResolutions).toEqual([
      {
        occurrenceId: "A1",
        location: 2,
        targetNoteId: "target-a",
        title: "Alpha",
      },
    ]);
  });

  it("preserves duplicate-title wikilink resolutions by occurrence id when positions shift", () => {
    appStore.setState({
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

    appStore.getState().actions.setDraft("note-1", "x [[Alpha]] [[Alpha]]", {
      preserveWikilinkResolutions: true,
    });

    expect(appStore.getState().draftWikilinkResolutions).toEqual([
      {
        occurrenceId: "B2",
        location: 12,
        targetNoteId: "target-b",
        title: "Alpha",
      },
    ]);
  });

  it("preserves duplicate-title wikilink resolutions at stable locations when occurrence count changes", () => {
    appStore.setState({
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

    appStore
      .getState()
      .actions.setDraft("note-1", "[[Alpha]] [[Alpha]] [[Alpha]]", {
        preserveWikilinkResolutions: true,
      });

    expect(appStore.getState().draftWikilinkResolutions).toEqual([
      {
        occurrenceId: "B2",
        location: 10,
        targetNoteId: "target-b",
        title: "Alpha",
      },
    ]);
  });

  it("preserves resolved wikilinks when only title casing changes", () => {
    appStore.setState({
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

    appStore.getState().actions.setDraft("note-1", "[[project   alpha]]", {
      preserveWikilinkResolutions: true,
    });

    expect(appStore.getState().draftWikilinkResolutions).toEqual([
      {
        occurrenceId: "A1",
        location: 0,
        targetNoteId: "target-a",
        title: "project   alpha",
      },
    ]);
  });
});

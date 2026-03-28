import { invoke } from "@tauri-apps/api/core";

import { initAttachmentsBasePath } from "@/shared/lib/attachments";

import {
  type BootstrapPayload,
  type ContextualTagsInput,
  type ContextualTagsPayload,
  type DeleteTagInput,
  type ExportNotesInput,
  type NoteConflictInfo,
  type LoadedNote,
  type NotePagePayload,
  type NoteQueryInput,
  type PublishNoteInput,
  type PublishShortNoteInput,
  type RenameTagInput,
  type SetHideSubtagNotesInput,
  type SetTagPinnedInput,
  type TagIndexDiagnostics,
} from "./types";

export const NOTE_PAGE_SIZE = 40;
const PENDING_DRAFT_KEY_PREFIX = "comet-pending-draft";

export function pendingDraftStorageKey(npub: string): string {
  return `${PENDING_DRAFT_KEY_PREFIX}:${npub}`;
}

export type PublishResult = {
  successCount: number;
  failCount: number;
  relayCount: number;
};

export async function getBootstrap() {
  const [bootstrap] = await Promise.all([
    invoke<BootstrapPayload>("bootstrap"),
    initAttachmentsBasePath(),
  ]);
  return bootstrap;
}

export async function getTodoCount() {
  return invoke<number>("todo_count");
}

export async function getTagIndexDiagnostics() {
  return invoke<TagIndexDiagnostics>("get_tag_index_diagnostics");
}

export async function repairTagIndex() {
  return invoke<TagIndexDiagnostics>("repair_tag_index");
}

export async function queryNotes(input: NoteQueryInput) {
  return invoke<NotePagePayload>("query_notes", { input });
}

export async function getContextualTags(input: ContextualTagsInput) {
  return invoke<ContextualTagsPayload>("contextual_tags", { input });
}

export async function loadNote(noteId: string) {
  const startedAt = import.meta.env.DEV ? performance.now() : 0;
  const note = await invoke<LoadedNote>("load_note", { noteId });

  if (import.meta.env.DEV) {
    console.log("[editor:loadNote]", {
      noteId,
      markdownLength: note.markdown.length,
      htmlLength: note.html.length,
      totalMs: Number((performance.now() - startedAt).toFixed(1)),
    });
  }

  return note;
}

export async function getNoteConflict(noteId: string) {
  return invoke<NoteConflictInfo | null>("get_note_conflict", { noteId });
}

export async function createNote(input: { tags: string[]; markdown?: string }) {
  return invoke<LoadedNote>("create_note", input);
}

export async function duplicateNote(noteId: string) {
  return invoke<LoadedNote>("duplicate_note", { noteId });
}

export async function saveNote(input: { id: string; markdown: string }) {
  return invoke<LoadedNote>("save_note", { input });
}

export async function setNoteReadonly(input: {
  noteId: string;
  readonly: boolean;
}) {
  return invoke<LoadedNote>("set_note_readonly", { input });
}

export async function renameTag(input: RenameTagInput) {
  return invoke<string[]>("rename_tag", { input });
}

export async function deleteTag(input: DeleteTagInput) {
  return invoke<string[]>("delete_tag", { input });
}

export async function setTagPinned(input: SetTagPinnedInput) {
  return invoke("set_tag_pinned", { input });
}

export async function setHideSubtagNotes(input: SetHideSubtagNotesInput) {
  return invoke("set_hide_subtag_notes", { input });
}

export async function archiveNote(noteId: string) {
  return invoke<LoadedNote>("archive_note", { noteId });
}

export async function restoreNote(noteId: string) {
  return invoke<LoadedNote>("restore_note", { noteId });
}

export async function trashNote(noteId: string) {
  return invoke<LoadedNote>("trash_note", { noteId });
}

export async function restoreFromTrash(noteId: string) {
  return invoke<LoadedNote>("restore_from_trash", { noteId });
}

export async function emptyTrash() {
  return invoke("empty_trash");
}

export async function deleteNotePermanently(noteId: string) {
  return invoke("delete_note_permanently", { noteId });
}

export async function pinNote(noteId: string) {
  return invoke<LoadedNote>("pin_note", { noteId });
}

export async function unpinNote(noteId: string) {
  return invoke<LoadedNote>("unpin_note", { noteId });
}

export async function publishNote(input: PublishNoteInput) {
  return invoke<PublishResult>("publish_note", { input });
}

export async function publishShortNote(input: PublishShortNoteInput) {
  return invoke<PublishResult>("publish_short_note", { input });
}

export async function deletePublishedNote(noteId: string) {
  return invoke<PublishResult>("delete_published_note", { noteId });
}

export async function resolveNoteConflict(
  noteId: string,
  deleteSelected = false,
) {
  return invoke("resolve_note_conflict", { deleteSelected, noteId });
}

export async function exportNotes(input: ExportNotesInput) {
  return invoke<number>("export_notes", { input });
}

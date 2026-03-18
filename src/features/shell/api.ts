import { invoke } from "@tauri-apps/api/core";

import { initAttachmentsBasePath } from "@/lib/attachments";
import { type NoteFilter } from "@/stores/use-shell-store";

import {
  type AssignNoteNotebookInput,
  type BootstrapPayload,
  type ContextualTagsInput,
  type ContextualTagsPayload,
  type CreateNotebookInput,
  type LoadedNote,
  type NotePagePayload,
  type NoteQueryInput,
  type PublishNoteInput,
  type PublishShortNoteInput,
  type RenameNotebookInput,
} from "./types";

export const NOTE_PAGE_SIZE = 40;
export const PENDING_DRAFT_KEY = "comet-pending-draft";

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

export async function queryNotes(input: NoteQueryInput) {
  return invoke<NotePagePayload>("query_notes", { input });
}

export async function getContextualTags(input: ContextualTagsInput) {
  return invoke<ContextualTagsPayload>("contextual_tags", { input });
}

export async function loadNote(noteId: string) {
  return invoke<LoadedNote>("load_note", { noteId });
}

export async function createNote(input: {
  notebookId: string | null;
  tags: string[];
}) {
  return invoke<LoadedNote>("create_note", input);
}

export async function saveNote(input: { id: string; markdown: string }) {
  return invoke<LoadedNote>("save_note", { input });
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

export async function createNotebook(input: CreateNotebookInput) {
  return invoke("create_notebook", { input });
}

export async function renameNotebook(input: RenameNotebookInput) {
  return invoke("rename_notebook", { input });
}

export async function deleteNotebook(notebookId: string) {
  return invoke("delete_notebook", { notebookId });
}

export async function assignNoteNotebook(input: AssignNoteNotebookInput) {
  return invoke<LoadedNote>("assign_note_notebook", { input });
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

export async function exportNotes(input: {
  noteFilter: NoteFilter;
  activeNotebookId: string | null;
  exportDir: string;
}) {
  return invoke<number>("export_notes", { input });
}

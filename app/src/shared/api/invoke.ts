import { invoke } from "@tauri-apps/api/core";

import { initAttachmentsBasePath } from "@/shared/lib/attachments";

import {
  type AccountSummary,
  type AppStatus,
  type BootstrapPayload,
  type ContextualTagsInput,
  type ContextualTagsPayload,
  type DeleteTagInput,
  type ExportNotesInput,
  type NoteConflictInfo,
  type NoteBacklink,
  type NoteHistoryInfo,
  type LoadedNote,
  type NotePagePayload,
  type NoteQueryInput,
  type PublishNoteInput,
  type PublishShortNoteInput,
  type RenameTagInput,
  type ResolveWikilinkInput,
  type ResolveNoteConflictAction,
  type SearchResult,
  type ThemeData,
  type ThemeSummary,
  type WikiLinkResolutionInput,
  type SetHideSubtagNotesInput,
  type SetTagPinnedInput,
  type SecretStorageStatus,
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

export async function getAppStatus() {
  return invoke<AppStatus>("app_status");
}

export async function listThemes() {
  return invoke<ThemeSummary[]>("list_themes");
}

export async function readTheme(themeId: string) {
  return invoke<ThemeData>("read_theme", { themeId });
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
  return invoke<LoadedNote>("load_note", { noteId });
}

export async function getNoteConflict(noteId: string) {
  return invoke<NoteConflictInfo | null>("get_note_conflict", { noteId });
}

export async function getNoteHistory(noteId: string) {
  return invoke<NoteHistoryInfo>("get_note_history", { noteId });
}

export async function getNoteBacklinks(noteId: string) {
  return invoke<NoteBacklink[]>("get_note_backlinks", { noteId });
}

export async function createNote(input: { tags: string[]; markdown?: string }) {
  return invoke<LoadedNote>("create_note", input);
}

export async function duplicateNote(noteId: string) {
  return invoke<LoadedNote>("duplicate_note", { noteId });
}

export async function searchNotes(query: string) {
  return invoke<SearchResult[]>("search_notes", { query });
}

export async function resolveWikilink(input: ResolveWikilinkInput) {
  return invoke<string | null>("resolve_wikilink", { input });
}

export async function saveNote(input: {
  id: string;
  markdown: string;
  wikilinkResolutions?: WikiLinkResolutionInput[];
}) {
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
  action: ResolveNoteConflictAction,
  markdown?: string,
  snapshotId?: string,
  wikilinkResolutions?: WikiLinkResolutionInput[],
) {
  return invoke("resolve_note_conflict", {
    action,
    markdown,
    noteId,
    snapshotId,
    wikilinkResolutions,
  });
}

export async function exportNotes(input: ExportNotesInput) {
  return invoke<number>("export_notes", { input });
}

export async function listAccounts() {
  return invoke<AccountSummary[]>("list_accounts");
}

export async function addAccount(input: {
  nsec: string;
  storeInKeychain: boolean;
}) {
  return invoke<AccountSummary>("add_account", input);
}

export async function switchAccount(publicKey: string) {
  return invoke<AccountSummary>("switch_account", { publicKey });
}

export async function getAccountNsec(publicKey: string) {
  return invoke<string>("get_account_nsec", { publicKey });
}

export async function getSecretStorageStatus() {
  return invoke<SecretStorageStatus>("get_secret_storage_status");
}

export async function moveSecretToKeychain() {
  return invoke<SecretStorageStatus>("move_secret_to_keychain");
}

export async function renameAccount(input: {
  publicKey: string;
  name: string;
}) {
  return invoke<void>("rename_account", input);
}

export async function getAccessKey() {
  return invoke<string | null>("get_access_key");
}

export async function setAccessKey(key: string) {
  return invoke<void>("set_access_key", { key });
}

export async function clearAccessKey() {
  return invoke<void>("clear_access_key");
}

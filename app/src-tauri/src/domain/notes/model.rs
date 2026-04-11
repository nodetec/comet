use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteSummary {
    pub id: String,
    pub title: String,
    pub edited_at: i64,
    pub preview: String,
    pub search_snippet: Option<String>,
    pub archived_at: Option<i64>,
    pub deleted_at: Option<i64>,
    pub pinned_at: Option<i64>,
    pub readonly: bool,
    pub has_conflict: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadedNote {
    pub id: String,
    pub title: String,
    pub modified_at: i64,
    pub markdown: String,
    pub archived_at: Option<i64>,
    pub deleted_at: Option<i64>,
    pub pinned_at: Option<i64>,
    pub readonly: bool,
    pub tags: Vec<String>,
    pub wikilink_resolutions: Vec<WikiLinkResolutionInput>,
    pub nostr_d_tag: Option<String>,
    pub published_at: Option<i64>,
    pub published_kind: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveNoteResponse {
    pub note: LoadedNote,
    pub affected_linked_note_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteConflictSnapshot {
    pub snapshot_id: String,
    pub mtime: i64,
    pub op: String,
    pub deleted_at: Option<i64>,
    pub title: Option<String>,
    pub markdown: Option<String>,
    pub preview: Option<String>,
    pub is_current: bool,
    pub is_available: bool,
    pub wikilink_resolutions: Vec<WikiLinkResolutionInput>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteConflictInfo {
    pub note_id: String,
    pub current_snapshot_id: Option<String>,
    pub snapshot_count: usize,
    pub relay_url: Option<String>,
    pub has_delete_candidate: bool,
    pub snapshots: Vec<NoteConflictSnapshot>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteHistorySnapshot {
    pub snapshot_id: String,
    pub mtime: i64,
    pub op: String,
    pub deleted_at: Option<i64>,
    pub title: Option<String>,
    pub markdown: Option<String>,
    pub preview: Option<String>,
    pub is_current: bool,
    pub is_conflict: bool,
    pub wikilink_resolutions: Vec<WikiLinkResolutionInput>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteHistoryInfo {
    pub note_id: String,
    pub snapshot_count: usize,
    pub snapshots: Vec<NoteHistorySnapshot>,
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ResolveNoteConflictAction {
    Restore,
    KeepDeleted,
    Merge,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NotePagePayload {
    pub notes: Vec<NoteSummary>,
    pub has_more: bool,
    pub next_offset: Option<usize>,
    pub total_count: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextualTagNode {
    pub path: String,
    pub label: String,
    pub depth: usize,
    pub pinned: bool,
    pub hide_subtag_notes: bool,
    pub icon: Option<String>,
    pub direct_note_count: usize,
    pub inclusive_note_count: usize,
    pub children: Vec<ContextualTagNode>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextualTagsPayload {
    pub roots: Vec<ContextualTagNode>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BootstrapPayload {
    pub npub: String,
    pub selected_note_id: Option<String>,
    pub initial_notes: NotePagePayload,
    pub initial_tags: ContextualTagsPayload,
    pub archived_count: i64,
    pub trashed_count: i64,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum NoteFilterInput {
    All,
    Today,
    Todo,
    Pinned,
    Untagged,
    Archive,
    Trash,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteQueryInput {
    pub note_filter: NoteFilterInput,
    pub search_query: String,
    pub active_tag_path: Option<String>,
    pub limit: usize,
    pub offset: usize,
    pub sort_field: NoteSortField,
    pub sort_direction: NoteSortDirection,
}

#[derive(Debug, Clone, Copy, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum NoteSortField {
    ModifiedAt,
    CreatedAt,
    Title,
}

#[derive(Debug, Clone, Copy, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum NoteSortDirection {
    Newest,
    Oldest,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextualTagsInput {
    pub note_filter: NoteFilterInput,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveNoteInput {
    pub id: String,
    pub markdown: String,
    #[serde(default)]
    pub wikilink_resolutions: Option<Vec<WikiLinkResolutionInput>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetNoteReadonlyInput {
    pub note_id: String,
    pub readonly: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenameTagInput {
    pub from_path: String,
    pub to_path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteTagInput {
    pub path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetTagPinnedInput {
    pub path: String,
    pub pinned: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetHideSubtagNotesInput {
    pub path: String,
    pub hide_subtag_notes: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetTagIconInput {
    pub path: String,
    pub icon: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    pub id: String,
    pub title: String,
    pub preview: String,
    pub archived_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteBacklink {
    pub source_note_id: String,
    pub source_title: String,
    pub source_preview: String,
    pub title: String,
    pub location: usize,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolveWikilinkInput {
    pub source_note_id: String,
    pub title: String,
    pub location: usize,
}

fn default_wikilink_resolution_explicit() -> bool {
    true
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WikiLinkResolutionInput {
    #[serde(default)]
    pub occurrence_id: Option<String>,
    #[serde(default = "default_wikilink_resolution_explicit")]
    pub is_explicit: bool,
    pub location: usize,
    pub title: String,
    pub target_note_id: String,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ExportModeInput {
    NoteFilter,
    Tag,
}

fn default_export_mode() -> ExportModeInput {
    ExportModeInput::NoteFilter
}

fn default_preserve_tags() -> bool {
    true
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportNotesInput {
    #[serde(default = "default_export_mode")]
    pub export_mode: ExportModeInput,
    pub note_filter: Option<NoteFilterInput>,
    pub tag_path: Option<String>,
    #[serde(default = "default_preserve_tags")]
    pub preserve_tags: bool,
    pub export_dir: String,
}

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, uniffi::Record)]
#[serde(rename_all = "camelCase")]
pub struct NotebookSummary {
    pub id: String,
    pub name: String,
    pub note_count: u64,
}

#[derive(Debug, Clone, Serialize, uniffi::Record)]
#[serde(rename_all = "camelCase")]
pub struct NotebookRef {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, uniffi::Record)]
#[serde(rename_all = "camelCase")]
pub struct NoteSummary {
    pub id: String,
    pub title: String,
    pub notebook: Option<NotebookRef>,
    pub edited_at: i64,
    pub preview: String,
    pub search_snippet: Option<String>,
    pub archived_at: Option<i64>,
    pub deleted_at: Option<i64>,
    pub pinned_at: Option<i64>,
    pub readonly: bool,
}

#[derive(Debug, Clone, Serialize, uniffi::Record)]
#[serde(rename_all = "camelCase")]
pub struct LoadedNote {
    pub id: String,
    pub title: String,
    pub notebook: Option<NotebookRef>,
    pub modified_at: i64,
    pub markdown: String,
    pub archived_at: Option<i64>,
    pub deleted_at: Option<i64>,
    pub pinned_at: Option<i64>,
    pub readonly: bool,
    pub tags: Vec<String>,
    pub nostr_d_tag: Option<String>,
    pub published_at: Option<i64>,
    pub published_kind: Option<i64>,
}

#[derive(Debug, Clone, Serialize, uniffi::Record)]
#[serde(rename_all = "camelCase")]
pub struct NotePagePayload {
    pub notes: Vec<NoteSummary>,
    pub has_more: bool,
    pub next_offset: Option<u64>,
    pub total_count: u64,
}

#[derive(Debug, Clone, Serialize, uniffi::Record)]
#[serde(rename_all = "camelCase")]
pub struct ContextualTagsPayload {
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, uniffi::Record)]
#[serde(rename_all = "camelCase")]
pub struct BootstrapPayload {
    pub npub: String,
    pub notebooks: Vec<NotebookSummary>,
    pub selected_note_id: Option<String>,
    pub initial_notes: NotePagePayload,
    pub initial_tags: ContextualTagsPayload,
    pub archived_count: i64,
    pub trashed_count: i64,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq, uniffi::Enum)]
#[serde(rename_all = "camelCase")]
pub enum NoteFilterInput {
    All,
    Today,
    Todo,
    Archive,
    Trash,
    Notebook,
}

#[derive(Debug, Clone, Deserialize, uniffi::Record)]
#[serde(rename_all = "camelCase")]
pub struct NoteQueryInput {
    pub note_filter: NoteFilterInput,
    pub active_notebook_id: Option<String>,
    pub search_query: String,
    pub active_tags: Vec<String>,
    pub limit: u64,
    pub offset: u64,
    pub sort_field: NoteSortField,
    pub sort_direction: NoteSortDirection,
}

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, uniffi::Enum)]
#[serde(rename_all = "snake_case")]
pub enum NoteSortField {
    ModifiedAt,
    CreatedAt,
    Title,
}

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, uniffi::Enum)]
#[serde(rename_all = "snake_case")]
pub enum NoteSortDirection {
    Newest,
    Oldest,
}

#[derive(Debug, Clone, Deserialize, uniffi::Record)]
#[serde(rename_all = "camelCase")]
pub struct ContextualTagsInput {
    pub note_filter: NoteFilterInput,
    pub active_notebook_id: Option<String>,
}

#[derive(Debug, Deserialize, uniffi::Record)]
#[serde(rename_all = "camelCase")]
pub struct SaveNoteInput {
    pub id: String,
    pub markdown: String,
}

#[derive(Debug, Deserialize, uniffi::Record)]
#[serde(rename_all = "camelCase")]
pub struct SetNoteReadonlyInput {
    pub note_id: String,
    pub readonly: bool,
}

#[derive(Debug, Deserialize, uniffi::Record)]
#[serde(rename_all = "camelCase")]
pub struct CreateNotebookInput {
    pub name: String,
}

#[derive(Debug, Deserialize, uniffi::Record)]
#[serde(rename_all = "camelCase")]
pub struct RenameNotebookInput {
    pub notebook_id: String,
    pub name: String,
}

#[derive(Debug, Deserialize, uniffi::Record)]
#[serde(rename_all = "camelCase")]
pub struct AssignNoteNotebookInput {
    pub note_id: String,
    pub notebook_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, uniffi::Record)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    pub id: String,
    pub title: String,
    pub notebook: Option<NotebookRef>,
    pub preview: String,
    pub archived_at: Option<i64>,
}

#[derive(Debug, Deserialize, uniffi::Record)]
#[serde(rename_all = "camelCase")]
pub struct ExportNotesInput {
    pub note_filter: NoteFilterInput,
    pub active_notebook_id: Option<String>,
    pub export_dir: String,
}

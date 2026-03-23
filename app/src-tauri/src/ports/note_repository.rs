use crate::domain::notes::error::NoteError;
use crate::domain::notes::model::{
    ContextualTagsInput, ContextualTagsPayload, ExportNotesInput, NotePagePayload, NoteQueryInput,
    NotebookSummary, SearchResult,
};

/// Raw database row for a note, without HTML rendering.
#[derive(Debug, Clone)]
pub struct NoteRecord {
    pub id: String,
    pub title: String,
    pub markdown: String,
    pub modified_at: i64,
    pub notebook_id: Option<String>,
    pub notebook_name: Option<String>,
    pub archived_at: Option<i64>,
    pub deleted_at: Option<i64>,
    pub pinned_at: Option<i64>,
    pub readonly: bool,
    pub nostr_d_tag: Option<String>,
    pub published_at: Option<i64>,
    pub published_kind: Option<i64>,
}

/// Abstracts all database operations for notes and notebooks.
///
/// Methods are granular so the service layer can orchestrate them.
/// Must not depend on rusqlite, Tauri, or any infrastructure.
pub trait NoteRepository {
    // ── Note reads ──────────────────────────────────────────────────────

    fn note_by_id(&self, note_id: &str) -> Result<Option<NoteRecord>, NoteError>;
    fn note_is_active(&self, note_id: &str) -> Result<bool, NoteError>;
    fn next_active_note_id(&self, excluding: Option<&str>) -> Result<Option<String>, NoteError>;
    fn note_markdown_and_notebook(&self, note_id: &str) -> Result<(String, Option<String>), NoteError>;
    fn note_markdown_and_readonly(&self, note_id: &str) -> Result<(String, bool), NoteError>;
    fn tags_for_note(&self, note_id: &str) -> Result<Vec<String>, NoteError>;
    fn archived_and_trashed_counts(&self) -> Result<(i64, i64), NoteError>;

    // ── Note writes ─────────────────────────────────────────────────────

    fn insert_note(&self, note_id: &str, title: &str, markdown: &str, notebook_id: Option<&str>, now: i64) -> Result<(), NoteError>;
    fn update_note_content(&self, note_id: &str, title: &str, markdown: &str, now: i64) -> Result<(), NoteError>;
    fn update_note_title_only(&self, note_id: &str, title: &str, markdown: &str) -> Result<(), NoteError>;
    fn set_readonly(&self, note_id: &str, readonly: bool, now: i64) -> Result<usize, NoteError>;
    fn archive_note(&self, note_id: &str, now: i64) -> Result<usize, NoteError>;
    fn restore_note(&self, note_id: &str, now: i64) -> Result<usize, NoteError>;
    fn trash_note(&self, note_id: &str, now: i64) -> Result<usize, NoteError>;
    fn restore_from_trash(&self, note_id: &str, now: i64) -> Result<usize, NoteError>;
    fn pin_note(&self, note_id: &str, now: i64) -> Result<usize, NoteError>;
    fn unpin_note(&self, note_id: &str, now: i64) -> Result<usize, NoteError>;
    fn assign_notebook(&self, note_id: &str, notebook_id: Option<&str>, now: i64) -> Result<usize, NoteError>;
    fn delete_note(&self, note_id: &str) -> Result<usize, NoteError>;
    fn trashed_note_ids(&self) -> Result<Vec<String>, NoteError>;
    fn delete_trashed_notes(&self) -> Result<(), NoteError>;

    // ── FTS / tags ──────────────────────────────────────────────────────

    fn upsert_search_document(&self, note_id: &str, title: &str, markdown: &str) -> Result<(), NoteError>;
    fn delete_search_document(&self, note_id: &str) -> Result<(), NoteError>;
    fn replace_tags(&self, note_id: &str, markdown: &str) -> Result<(), NoteError>;

    // ── Queries ─────────────────────────────────────────────────────────

    fn query_note_page(&self, input: &NoteQueryInput) -> Result<NotePagePayload, NoteError>;
    fn search_notes(&self, query: &str) -> Result<Vec<SearchResult>, NoteError>;
    fn search_tags(&self, query: &str) -> Result<Vec<String>, NoteError>;
    fn query_contextual_tags(&self, input: &ContextualTagsInput) -> Result<ContextualTagsPayload, NoteError>;
    fn todo_count(&self) -> Result<i64, NoteError>;
    fn export_notes(&self, input: &ExportNotesInput) -> Result<usize, NoteError>;

    // ── Notebooks ───────────────────────────────────────────────────────

    fn list_notebooks(&self) -> Result<Vec<NotebookSummary>, NoteError>;
    fn insert_notebook(&self, id: &str, name: &str, now: i64) -> Result<(), NoteError>;
    fn notebook_by_id(&self, notebook_id: &str) -> Result<Option<NotebookSummary>, NoteError>;
    fn rename_notebook(&self, notebook_id: &str, name: &str, now: i64) -> Result<usize, NoteError>;
    fn delete_notebook(&self, notebook_id: &str) -> Result<usize, NoteError>;
    fn notebook_exists(&self, notebook_id: &str) -> Result<bool, NoteError>;

    // ── App settings ────────────────────────────────────────────────────

    fn last_open_note_id(&self) -> Result<Option<String>, NoteError>;
    fn set_last_open_note_id(&self, note_id: Option<&str>) -> Result<(), NoteError>;

    // ── Nostr identity ──────────────────────────────────────────────────

    fn current_npub(&self) -> Result<String, NoteError>;
}

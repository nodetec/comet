use crate::domain::common::text::{extract_tags, title_from_markdown};
use crate::domain::common::time::now_millis;
use crate::domain::notes::error::NoteError;
use crate::domain::notes::model::*;
use crate::ports::note_repository::{NoteRecord, NoteRepository};

const INITIAL_NOTES_PAGE_SIZE: usize = 40;

pub struct NoteService;

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

fn validate_note_id(note_id: &str) -> Result<(), NoteError> {
    if note_id.is_empty()
        || note_id.contains('/')
        || note_id.contains('\\')
        || note_id.contains("..")
    {
        return Err(NoteError::InvalidNoteId);
    }
    Ok(())
}

fn validate_notebook_id(notebook_id: &str) -> Result<(), NoteError> {
    if notebook_id.is_empty()
        || notebook_id.contains('/')
        || notebook_id.contains('\\')
        || notebook_id.contains("..")
    {
        return Err(NoteError::InvalidNotebookId);
    }
    Ok(())
}

fn normalize_notebook_name(name: &str) -> Result<String, NoteError> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err(NoteError::EmptyNotebookName);
    }
    if trimmed.len() > 80 {
        return Err(NoteError::NotebookNameTooLong);
    }
    Ok(trimmed.to_string())
}

fn generate_note_id() -> String {
    format!("note-{}", now_millis())
}

fn generate_notebook_id() -> String {
    format!("notebook-{}", now_millis())
}

/// Build the default markdown content for a new note.
fn default_markdown(tags: &[String]) -> String {
    if tags.is_empty() {
        "# ".to_string()
    } else {
        let tag_line = tags
            .iter()
            .map(|t| format!("#{t}"))
            .collect::<Vec<_>>()
            .join(" ");
        format!("# \n\n{tag_line}")
    }
}

// ---------------------------------------------------------------------------
// Service methods
// ---------------------------------------------------------------------------

impl NoteService {
    pub fn bootstrap(repo: &dyn NoteRepository) -> Result<BootstrapPayload, NoteError> {
        let npub = repo.current_npub()?;
        let notebooks = repo.list_notebooks()?;

        let selected_note_id = repo
            .last_open_note_id()?
            .filter(|id| repo.note_is_active(id).unwrap_or(false))
            .or_else(|| repo.next_active_note_id(None).ok().flatten());

        let initial_notes = Self::query_notes(
            repo,
            NoteQueryInput {
                note_filter: NoteFilterInput::All,
                active_notebook_id: None,
                search_query: String::new(),
                active_tags: Vec::new(),
                limit: INITIAL_NOTES_PAGE_SIZE,
                offset: 0,
                sort_field: NoteSortField::ModifiedAt,
                sort_direction: NoteSortDirection::Newest,
            },
        )?;

        let initial_tags = Self::contextual_tags(
            repo,
            ContextualTagsInput {
                note_filter: NoteFilterInput::All,
                active_notebook_id: None,
            },
        )?;

        let (archived_count, trashed_count) = repo.archived_and_trashed_counts()?;

        Ok(BootstrapPayload {
            npub,
            notebooks,
            selected_note_id,
            initial_notes,
            initial_tags,
            archived_count,
            trashed_count,
        })
    }

    pub fn query_notes(
        repo: &dyn NoteRepository,
        input: NoteQueryInput,
    ) -> Result<NotePagePayload, NoteError> {
        repo.query_note_page(&input)
    }

    pub fn contextual_tags(
        repo: &dyn NoteRepository,
        input: ContextualTagsInput,
    ) -> Result<ContextualTagsPayload, NoteError> {
        repo.query_contextual_tags(&input)
    }

    pub fn load_note(repo: &dyn NoteRepository, note_id: &str) -> Result<NoteRecord, NoteError> {
        validate_note_id(note_id)?;
        let record = repo.note_by_id(note_id)?.ok_or(NoteError::NotFound)?;
        repo.set_last_open_note_id(Some(note_id))?;
        Ok(record)
    }

    pub fn create_note(
        repo: &dyn NoteRepository,
        notebook_id: Option<&str>,
        tags: &[String],
        initial_markdown: Option<&str>,
    ) -> Result<NoteRecord, NoteError> {
        let note_id = generate_note_id();
        let markdown = initial_markdown
            .map(|md| md.to_string())
            .unwrap_or_else(|| default_markdown(tags));
        let title = title_from_markdown(&markdown);
        let now = now_millis();
        let extracted_tags = extract_tags(&markdown);

        repo.insert_note(&note_id, &title, &markdown, notebook_id, now)?;
        repo.upsert_search_document(&note_id, &title, &markdown)?;
        if !extracted_tags.is_empty() {
            repo.replace_tags(&note_id, &markdown)?;
        }
        repo.set_last_open_note_id(Some(&note_id))?;

        repo.note_by_id(&note_id)?.ok_or(NoteError::NotFound)
    }

    pub fn duplicate_note(
        repo: &dyn NoteRepository,
        note_id: &str,
    ) -> Result<NoteRecord, NoteError> {
        validate_note_id(note_id)?;
        let (markdown, notebook_id) = repo.note_markdown_and_notebook(note_id)?;
        Self::create_note(repo, notebook_id.as_deref(), &[], Some(&markdown))
    }

    /// Returns `(record, content_changed)`.
    pub fn save_note(
        repo: &dyn NoteRepository,
        input: SaveNoteInput,
    ) -> Result<(NoteRecord, bool), NoteError> {
        validate_note_id(&input.id)?;
        let title = title_from_markdown(&input.markdown);

        let (existing_markdown, is_readonly) = repo.note_markdown_and_readonly(&input.id)?;
        if is_readonly {
            return Err(NoteError::ReadOnly);
        }

        let content_changed = existing_markdown != input.markdown;

        if content_changed {
            let now = now_millis();
            repo.update_note_content(&input.id, &title, &input.markdown, now)?;
        } else {
            repo.update_note_title_only(&input.id, &title, &input.markdown)?;
        }

        repo.upsert_search_document(&input.id, &title, &input.markdown)?;
        repo.replace_tags(&input.id, &input.markdown)?;
        repo.set_last_open_note_id(Some(&input.id))?;

        let record = repo.note_by_id(&input.id)?.ok_or(NoteError::NotFound)?;
        Ok((record, content_changed))
    }

    pub fn set_readonly(
        repo: &dyn NoteRepository,
        input: SetNoteReadonlyInput,
    ) -> Result<NoteRecord, NoteError> {
        validate_note_id(&input.note_id)?;
        let now = now_millis();
        let updated = repo.set_readonly(&input.note_id, input.readonly, now)?;
        if updated == 0 {
            return Err(NoteError::NotFound);
        }
        repo.note_by_id(&input.note_id)?.ok_or(NoteError::NotFound)
    }

    pub fn archive_note(
        repo: &dyn NoteRepository,
        note_id: &str,
    ) -> Result<NoteRecord, NoteError> {
        validate_note_id(note_id)?;
        let now = now_millis();
        let updated = repo.archive_note(note_id, now)?;
        if updated == 0 {
            return Err(NoteError::NotFound);
        }

        if repo.last_open_note_id()?.as_deref() == Some(note_id) {
            let next = repo.next_active_note_id(Some(note_id))?;
            repo.set_last_open_note_id(next.as_deref())?;
        }

        repo.note_by_id(note_id)?.ok_or(NoteError::NotFound)
    }

    pub fn restore_note(
        repo: &dyn NoteRepository,
        note_id: &str,
    ) -> Result<NoteRecord, NoteError> {
        validate_note_id(note_id)?;
        let now = now_millis();
        let updated = repo.restore_note(note_id, now)?;
        if updated == 0 {
            return Err(NoteError::NotFound);
        }
        repo.note_by_id(note_id)?.ok_or(NoteError::NotFound)
    }

    pub fn trash_note(
        repo: &dyn NoteRepository,
        note_id: &str,
    ) -> Result<NoteRecord, NoteError> {
        validate_note_id(note_id)?;
        let now = now_millis();
        let updated = repo.trash_note(note_id, now)?;
        if updated == 0 {
            return Err(NoteError::NotFound);
        }

        if repo.last_open_note_id()?.as_deref() == Some(note_id) {
            let next = repo.next_active_note_id(Some(note_id))?;
            repo.set_last_open_note_id(next.as_deref())?;
        }

        repo.note_by_id(note_id)?.ok_or(NoteError::NotFound)
    }

    pub fn restore_from_trash(
        repo: &dyn NoteRepository,
        note_id: &str,
    ) -> Result<NoteRecord, NoteError> {
        validate_note_id(note_id)?;
        let now = now_millis();
        let updated = repo.restore_from_trash(note_id, now)?;
        if updated == 0 {
            return Err(NoteError::NotFound);
        }
        repo.note_by_id(note_id)?.ok_or(NoteError::NotFound)
    }

    /// Permanently deletes a note from the database and updates navigation.
    /// Returns the IDs of trashed notes that were deleted (just `[note_id]`).
    /// Blob cleanup must be handled by the caller.
    pub fn delete_permanently(
        repo: &dyn NoteRepository,
        note_id: &str,
    ) -> Result<(), NoteError> {
        validate_note_id(note_id)?;
        repo.delete_search_document(note_id)?;
        let deleted = repo.delete_note(note_id)?;
        if deleted == 0 {
            return Err(NoteError::NotFound);
        }

        if repo.last_open_note_id()?.as_deref() == Some(note_id) {
            let next = repo.next_active_note_id(Some(note_id))?;
            repo.set_last_open_note_id(next.as_deref())?;
        }

        Ok(())
    }

    /// Permanently deletes all trashed notes. Returns the IDs of deleted notes.
    /// Blob cleanup must be handled by the caller.
    pub fn empty_trash(repo: &dyn NoteRepository) -> Result<Vec<String>, NoteError> {
        let note_ids = repo.trashed_note_ids()?;
        repo.delete_trashed_notes()?;
        Ok(note_ids)
    }

    pub fn create_notebook(
        repo: &dyn NoteRepository,
        input: CreateNotebookInput,
    ) -> Result<NotebookSummary, NoteError> {
        let name = normalize_notebook_name(&input.name)?;
        let notebook_id = generate_notebook_id();
        let now = now_millis();
        repo.insert_notebook(&notebook_id, &name, now)?;
        repo.notebook_by_id(&notebook_id)?
            .ok_or_else(|| NoteError::Storage("Failed to create notebook.".into()))
    }

    pub fn rename_notebook(
        repo: &dyn NoteRepository,
        input: RenameNotebookInput,
    ) -> Result<NotebookSummary, NoteError> {
        validate_notebook_id(&input.notebook_id)?;
        let name = normalize_notebook_name(&input.name)?;
        let now = now_millis();
        let updated = repo.rename_notebook(&input.notebook_id, &name, now)?;
        if updated == 0 {
            return Err(NoteError::NotebookNotFound);
        }
        repo.notebook_by_id(&input.notebook_id)?
            .ok_or_else(|| NoteError::Storage("Failed to rename notebook.".into()))
    }

    pub fn delete_notebook(
        repo: &dyn NoteRepository,
        notebook_id: &str,
    ) -> Result<(), NoteError> {
        validate_notebook_id(notebook_id)?;
        let deleted = repo.delete_notebook(notebook_id)?;
        if deleted == 0 {
            return Err(NoteError::NotebookNotFound);
        }
        Ok(())
    }

    pub fn assign_notebook(
        repo: &dyn NoteRepository,
        input: AssignNoteNotebookInput,
    ) -> Result<NoteRecord, NoteError> {
        validate_note_id(&input.note_id)?;
        if let Some(ref notebook_id) = input.notebook_id {
            validate_notebook_id(notebook_id)?;
            if !repo.notebook_exists(notebook_id)? {
                return Err(NoteError::NotebookNotFound);
            }
        }

        let now = now_millis();
        let updated =
            repo.assign_notebook(&input.note_id, input.notebook_id.as_deref(), now)?;
        if updated == 0 {
            return Err(NoteError::NotFound);
        }

        repo.set_last_open_note_id(Some(&input.note_id))?;
        repo.note_by_id(&input.note_id)?.ok_or(NoteError::NotFound)
    }

    pub fn pin_note(repo: &dyn NoteRepository, note_id: &str) -> Result<NoteRecord, NoteError> {
        validate_note_id(note_id)?;
        let now = now_millis();
        let updated = repo.pin_note(note_id, now)?;
        if updated == 0 {
            return Err(NoteError::NotFound);
        }
        repo.note_by_id(note_id)?.ok_or(NoteError::NotFound)
    }

    pub fn unpin_note(repo: &dyn NoteRepository, note_id: &str) -> Result<NoteRecord, NoteError> {
        validate_note_id(note_id)?;
        let now = now_millis();
        let updated = repo.unpin_note(note_id, now)?;
        if updated == 0 {
            return Err(NoteError::NotFound);
        }
        repo.note_by_id(note_id)?.ok_or(NoteError::NotFound)
    }

    pub fn search_notes(
        repo: &dyn NoteRepository,
        query: &str,
    ) -> Result<Vec<SearchResult>, NoteError> {
        repo.search_notes(query)
    }

    pub fn search_tags(
        repo: &dyn NoteRepository,
        query: &str,
    ) -> Result<Vec<String>, NoteError> {
        repo.search_tags(query)
    }

    pub fn export_notes(
        repo: &dyn NoteRepository,
        input: ExportNotesInput,
    ) -> Result<usize, NoteError> {
        repo.export_notes(&input)
    }

    pub fn todo_count(repo: &dyn NoteRepository) -> Result<i64, NoteError> {
        repo.todo_count()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;
    use std::collections::HashMap;

    // ── Pure validation / normalization tests ────────────────────────────

    #[test]
    fn validate_note_id_accepts_valid_ids() {
        assert!(validate_note_id("note-1234").is_ok());
        assert!(validate_note_id("abc").is_ok());
        assert!(validate_note_id("note_with_underscores").is_ok());
    }

    #[test]
    fn validate_note_id_rejects_empty() {
        assert!(matches!(
            validate_note_id(""),
            Err(NoteError::InvalidNoteId)
        ));
    }

    #[test]
    fn validate_note_id_rejects_slash() {
        assert!(matches!(
            validate_note_id("a/b"),
            Err(NoteError::InvalidNoteId)
        ));
        assert!(matches!(
            validate_note_id("a\\b"),
            Err(NoteError::InvalidNoteId)
        ));
    }

    #[test]
    fn validate_note_id_rejects_dotdot() {
        assert!(matches!(
            validate_note_id("a..b"),
            Err(NoteError::InvalidNoteId)
        ));
    }

    #[test]
    fn normalize_notebook_name_trims_whitespace() {
        assert_eq!(
            normalize_notebook_name("  Field Notes  ").unwrap(),
            "Field Notes"
        );
    }

    #[test]
    fn normalize_notebook_name_rejects_empty() {
        assert!(matches!(
            normalize_notebook_name(""),
            Err(NoteError::EmptyNotebookName)
        ));
        assert!(matches!(
            normalize_notebook_name("   "),
            Err(NoteError::EmptyNotebookName)
        ));
    }

    #[test]
    fn normalize_notebook_name_rejects_too_long() {
        let long_name = "a".repeat(81);
        assert!(matches!(
            normalize_notebook_name(&long_name),
            Err(NoteError::NotebookNameTooLong)
        ));
    }

    #[test]
    fn normalize_notebook_name_accepts_max_length() {
        let name = "a".repeat(80);
        assert_eq!(normalize_notebook_name(&name).unwrap(), name);
    }

    // ── Mock repository ─────────────────────────────────────────────────

    struct MockNoteRepository {
        notes: RefCell<HashMap<String, NoteRecord>>,
        last_open_note_id: RefCell<Option<String>>,
    }

    impl MockNoteRepository {
        fn new() -> Self {
            Self {
                notes: RefCell::new(HashMap::new()),
                last_open_note_id: RefCell::new(None),
            }
        }

        fn with_note(self, record: NoteRecord) -> Self {
            self.notes.borrow_mut().insert(record.id.clone(), record);
            self
        }
    }

    impl NoteRepository for MockNoteRepository {
        fn note_by_id(&self, note_id: &str) -> Result<Option<NoteRecord>, NoteError> {
            Ok(self.notes.borrow().get(note_id).cloned())
        }

        fn insert_note(
            &self,
            note_id: &str,
            title: &str,
            markdown: &str,
            notebook_id: Option<&str>,
            now: i64,
        ) -> Result<(), NoteError> {
            let record = NoteRecord {
                id: note_id.to_string(),
                title: title.to_string(),
                markdown: markdown.to_string(),
                modified_at: now,
                notebook_id: notebook_id.map(str::to_string),
                notebook_name: None,
                archived_at: None,
                deleted_at: None,
                pinned_at: None,
                readonly: false,
                nostr_d_tag: None,
                published_at: None,
                published_kind: None,
            };
            self.notes.borrow_mut().insert(note_id.to_string(), record);
            Ok(())
        }

        fn upsert_search_document(
            &self,
            _note_id: &str,
            _title: &str,
            _markdown: &str,
        ) -> Result<(), NoteError> {
            Ok(())
        }

        fn replace_tags(&self, _note_id: &str, _markdown: &str) -> Result<(), NoteError> {
            Ok(())
        }

        fn set_last_open_note_id(&self, note_id: Option<&str>) -> Result<(), NoteError> {
            *self.last_open_note_id.borrow_mut() = note_id.map(str::to_string);
            Ok(())
        }

        fn last_open_note_id(&self) -> Result<Option<String>, NoteError> {
            Ok(self.last_open_note_id.borrow().clone())
        }

        fn note_markdown_and_readonly(
            &self,
            note_id: &str,
        ) -> Result<(String, bool), NoteError> {
            let notes = self.notes.borrow();
            let record = notes
                .get(note_id)
                .ok_or(NoteError::NotFound)?;
            Ok((record.markdown.clone(), record.readonly))
        }

        fn update_note_content(
            &self,
            note_id: &str,
            title: &str,
            markdown: &str,
            now: i64,
        ) -> Result<(), NoteError> {
            let mut notes = self.notes.borrow_mut();
            if let Some(record) = notes.get_mut(note_id) {
                record.title = title.to_string();
                record.markdown = markdown.to_string();
                record.modified_at = now;
            }
            Ok(())
        }

        fn update_note_title_only(
            &self,
            note_id: &str,
            title: &str,
            markdown: &str,
        ) -> Result<(), NoteError> {
            let mut notes = self.notes.borrow_mut();
            if let Some(record) = notes.get_mut(note_id) {
                record.title = title.to_string();
                record.markdown = markdown.to_string();
            }
            Ok(())
        }

        // Remaining trait methods are not needed for the tests below.
        fn note_is_active(&self, _: &str) -> Result<bool, NoteError> { unimplemented!() }
        fn next_active_note_id(&self, _: Option<&str>) -> Result<Option<String>, NoteError> { unimplemented!() }
        fn note_markdown_and_notebook(&self, _: &str) -> Result<(String, Option<String>), NoteError> { unimplemented!() }
        fn tags_for_note(&self, _: &str) -> Result<Vec<String>, NoteError> { unimplemented!() }
        fn archived_and_trashed_counts(&self) -> Result<(i64, i64), NoteError> { unimplemented!() }
        fn set_readonly(&self, _: &str, _: bool, _: i64) -> Result<usize, NoteError> { unimplemented!() }
        fn archive_note(&self, _: &str, _: i64) -> Result<usize, NoteError> { unimplemented!() }
        fn restore_note(&self, _: &str, _: i64) -> Result<usize, NoteError> { unimplemented!() }
        fn trash_note(&self, _: &str, _: i64) -> Result<usize, NoteError> { unimplemented!() }
        fn restore_from_trash(&self, _: &str, _: i64) -> Result<usize, NoteError> { unimplemented!() }
        fn pin_note(&self, _: &str, _: i64) -> Result<usize, NoteError> { unimplemented!() }
        fn unpin_note(&self, _: &str, _: i64) -> Result<usize, NoteError> { unimplemented!() }
        fn assign_notebook(&self, _: &str, _: Option<&str>, _: i64) -> Result<usize, NoteError> { unimplemented!() }
        fn delete_note(&self, _: &str) -> Result<usize, NoteError> { unimplemented!() }
        fn trashed_note_ids(&self) -> Result<Vec<String>, NoteError> { unimplemented!() }
        fn delete_trashed_notes(&self) -> Result<(), NoteError> { unimplemented!() }
        fn delete_search_document(&self, _: &str) -> Result<(), NoteError> { unimplemented!() }
        fn query_note_page(&self, _: &NoteQueryInput) -> Result<NotePagePayload, NoteError> { unimplemented!() }
        fn search_notes(&self, _: &str) -> Result<Vec<SearchResult>, NoteError> { unimplemented!() }
        fn search_tags(&self, _: &str) -> Result<Vec<String>, NoteError> { unimplemented!() }
        fn query_contextual_tags(&self, _: &ContextualTagsInput) -> Result<ContextualTagsPayload, NoteError> { unimplemented!() }
        fn todo_count(&self) -> Result<i64, NoteError> { unimplemented!() }
        fn export_notes(&self, _: &ExportNotesInput) -> Result<usize, NoteError> { unimplemented!() }
        fn list_notebooks(&self) -> Result<Vec<NotebookSummary>, NoteError> { unimplemented!() }
        fn insert_notebook(&self, _: &str, _: &str, _: i64) -> Result<(), NoteError> { unimplemented!() }
        fn notebook_by_id(&self, _: &str) -> Result<Option<NotebookSummary>, NoteError> { unimplemented!() }
        fn rename_notebook(&self, _: &str, _: &str, _: i64) -> Result<usize, NoteError> { unimplemented!() }
        fn delete_notebook(&self, _: &str) -> Result<usize, NoteError> { unimplemented!() }
        fn notebook_exists(&self, _: &str) -> Result<bool, NoteError> { unimplemented!() }
        fn current_npub(&self) -> Result<String, NoteError> { unimplemented!() }
    }

    // ── create_note ─────────────────────────────────────────────────────

    #[test]
    fn create_note_inserts_and_returns_record() {
        let repo = MockNoteRepository::new();

        let record = NoteService::create_note(&repo, None, &[], None)
            .expect("create_note should succeed");

        assert!(record.id.starts_with("note-"));
        assert!(record.markdown.starts_with("# "));
        assert!(!record.readonly);
        assert!(record.notebook_id.is_none());
        // Verify it was stored
        assert!(repo.notes.borrow().contains_key(&record.id));
    }

    #[test]
    fn create_note_with_notebook() {
        let repo = MockNoteRepository::new();

        let record = NoteService::create_note(&repo, Some("nb-1"), &[], None)
            .expect("create_note should succeed");

        assert_eq!(record.notebook_id.as_deref(), Some("nb-1"));
    }

    #[test]
    fn create_note_with_initial_markdown() {
        let repo = MockNoteRepository::new();

        let record = NoteService::create_note(
            &repo,
            None,
            &[],
            Some("# Imported\n\nContent here"),
        )
        .expect("create_note should succeed");

        assert_eq!(record.title, "Imported");
        assert!(record.markdown.contains("Content here"));
    }

    #[test]
    fn create_note_sets_last_open_note_id() {
        let repo = MockNoteRepository::new();

        let record = NoteService::create_note(&repo, None, &[], None).unwrap();

        assert_eq!(
            repo.last_open_note_id.borrow().as_deref(),
            Some(record.id.as_str())
        );
    }

    // ── save_note ───────────────────────────────────────────────────────

    #[test]
    fn save_note_rejects_readonly_note() {
        let record = NoteRecord {
            id: "note-ro".to_string(),
            title: "Locked".to_string(),
            markdown: "# Locked".to_string(),
            modified_at: 1000,
            notebook_id: None,
            notebook_name: None,
            archived_at: None,
            deleted_at: None,
            pinned_at: None,
            readonly: true,
            nostr_d_tag: None,
            published_at: None,
            published_kind: None,
        };
        let repo = MockNoteRepository::new().with_note(record);

        let result = NoteService::save_note(
            &repo,
            SaveNoteInput {
                id: "note-ro".to_string(),
                markdown: "# Changed".to_string(),
            },
        );

        assert!(matches!(result, Err(NoteError::ReadOnly)));
    }

    #[test]
    fn save_note_detects_content_changed() {
        let record = NoteRecord {
            id: "note-1".to_string(),
            title: "Original".to_string(),
            markdown: "# Original\n\nOld body".to_string(),
            modified_at: 1000,
            notebook_id: None,
            notebook_name: None,
            archived_at: None,
            deleted_at: None,
            pinned_at: None,
            readonly: false,
            nostr_d_tag: None,
            published_at: None,
            published_kind: None,
        };
        let repo = MockNoteRepository::new().with_note(record);

        let (_, changed) = NoteService::save_note(
            &repo,
            SaveNoteInput {
                id: "note-1".to_string(),
                markdown: "# Original\n\nNew body".to_string(),
            },
        )
        .expect("save should succeed");

        assert!(changed);
    }

    #[test]
    fn save_note_detects_no_content_change() {
        let markdown = "# Same\n\nSame body".to_string();
        let record = NoteRecord {
            id: "note-2".to_string(),
            title: "Same".to_string(),
            markdown: markdown.clone(),
            modified_at: 1000,
            notebook_id: None,
            notebook_name: None,
            archived_at: None,
            deleted_at: None,
            pinned_at: None,
            readonly: false,
            nostr_d_tag: None,
            published_at: None,
            published_kind: None,
        };
        let repo = MockNoteRepository::new().with_note(record);

        let (_, changed) = NoteService::save_note(
            &repo,
            SaveNoteInput {
                id: "note-2".to_string(),
                markdown,
            },
        )
        .expect("save should succeed");

        assert!(!changed);
    }

    #[test]
    fn save_note_rejects_invalid_id() {
        let repo = MockNoteRepository::new();

        let result = NoteService::save_note(
            &repo,
            SaveNoteInput {
                id: "../escape".to_string(),
                markdown: "# Hack".to_string(),
            },
        );

        assert!(matches!(result, Err(NoteError::InvalidNoteId)));
    }
}

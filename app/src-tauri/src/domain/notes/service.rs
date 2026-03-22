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

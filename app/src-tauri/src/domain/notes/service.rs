use crate::domain::common::text::{
    canonicalize_tag_path, extract_tags, render_tag_token, rewrite_tag_path_in_markdown,
    title_from_markdown,
};
use crate::domain::common::time::now_millis;
use crate::domain::notes::error::NoteError;
use crate::domain::notes::model::*;
use crate::ports::note_repository::{NoteRecord, NoteRepository};

const INITIAL_NOTES_PAGE_SIZE: usize = 40;
const TAG_REWRITE_WARN_THRESHOLD: usize = 100;

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

fn generate_note_id() -> String {
    format!("note-{}", now_millis())
}

fn validate_tag_path(path: &str) -> Result<String, NoteError> {
    canonicalize_tag_path(path).ok_or(NoteError::InvalidTagPath)
}

/// Build the default markdown content for a new note.
fn default_markdown(tags: &[String]) -> String {
    if tags.is_empty() {
        "# ".to_string()
    } else {
        let tag_line = tags
            .iter()
            .filter_map(|tag| render_tag_token(tag))
            .collect::<Vec<_>>()
            .join(" ");
        if tag_line.is_empty() {
            "# ".to_string()
        } else {
            format!("# \n\n{tag_line}")
        }
    }
}

// ---------------------------------------------------------------------------
// Service methods
// ---------------------------------------------------------------------------

impl NoteService {
    pub fn bootstrap(repo: &dyn NoteRepository) -> Result<BootstrapPayload, NoteError> {
        let npub = repo.current_npub()?;

        let selected_note_id = repo
            .last_open_note_id()?
            .filter(|id| repo.note_is_active(id).unwrap_or(false))
            .or_else(|| repo.next_active_note_id(None).ok().flatten());

        let initial_notes = Self::query_notes(
            repo,
            NoteQueryInput {
                note_filter: NoteFilterInput::All,
                search_query: String::new(),
                active_tag_path: None,
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
            },
        )?;

        let (archived_count, trashed_count) = repo.archived_and_trashed_counts()?;

        Ok(BootstrapPayload {
            npub,
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

        repo.insert_note(&note_id, &title, &markdown, now)?;
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
        let markdown = repo.note_markdown(note_id)?;
        Self::create_note(repo, &[], Some(&markdown))
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

    pub fn rename_tag(
        repo: &dyn NoteRepository,
        input: RenameTagInput,
    ) -> Result<Vec<String>, NoteError> {
        let from_path = validate_tag_path(&input.from_path)?;
        let to_path = validate_tag_path(&input.to_path)?;
        if from_path == to_path {
            return Ok(Vec::new());
        }

        let was_pinned = repo.tag_is_pinned(&from_path)?;
        let note_ids = repo.note_ids_with_direct_tag_subtree(&from_path)?;
        log::info!(
            "[tags] rename requested from={} to={} candidate_notes={}",
            from_path,
            to_path,
            note_ids.len()
        );
        if note_ids.is_empty() {
            return Err(NoteError::TagNotFound);
        }

        let mut affected = Vec::new();
        for note_id in note_ids {
            let (markdown, readonly) = repo.note_markdown_and_readonly(&note_id)?;
            if readonly {
                return Err(NoteError::ReadOnly);
            }
            let rewritten = rewrite_tag_path_in_markdown(&markdown, &from_path, Some(&to_path))
                .ok_or(NoteError::InvalidTagPath)?;
            if rewritten == markdown {
                continue;
            }

            let title = title_from_markdown(&rewritten);
            repo.update_note_markdown_preserving_modified_at(&note_id, &title, &rewritten)?;
            repo.upsert_search_document(&note_id, &title, &rewritten)?;
            repo.replace_tags(&note_id, &rewritten)?;
            affected.push(note_id);
        }

        if affected.len() >= TAG_REWRITE_WARN_THRESHOLD {
            log::warn!(
                "[tags] rename affected many notes from={} to={} affected={}",
                from_path,
                to_path,
                affected.len()
            );
        } else {
            log::info!(
                "[tags] rename completed from={} to={} affected={}",
                from_path,
                to_path,
                affected.len()
            );
        }

        if was_pinned {
            let _ = repo.set_tag_pinned(&from_path, false)?;
            let _ = repo.set_tag_pinned(&to_path, true)?;
        }

        Ok(affected)
    }

    pub fn delete_tag(
        repo: &dyn NoteRepository,
        input: DeleteTagInput,
    ) -> Result<Vec<String>, NoteError> {
        let path = validate_tag_path(&input.path)?;
        let note_ids = repo.note_ids_with_direct_tag_subtree(&path)?;
        log::info!(
            "[tags] delete requested path={} candidate_notes={}",
            path,
            note_ids.len()
        );
        if note_ids.is_empty() {
            return Err(NoteError::TagNotFound);
        }

        let mut affected = Vec::new();
        for note_id in note_ids {
            let (markdown, readonly) = repo.note_markdown_and_readonly(&note_id)?;
            if readonly {
                return Err(NoteError::ReadOnly);
            }
            let rewritten = rewrite_tag_path_in_markdown(&markdown, &path, None)
                .ok_or(NoteError::InvalidTagPath)?;
            if rewritten == markdown {
                continue;
            }

            let title = title_from_markdown(&rewritten);
            repo.update_note_markdown_preserving_modified_at(&note_id, &title, &rewritten)?;
            repo.upsert_search_document(&note_id, &title, &rewritten)?;
            repo.replace_tags(&note_id, &rewritten)?;
            affected.push(note_id);
        }

        if affected.len() >= TAG_REWRITE_WARN_THRESHOLD {
            log::warn!(
                "[tags] delete affected many notes path={} affected={}",
                path,
                affected.len()
            );
        } else {
            log::info!(
                "[tags] delete completed path={} affected={}",
                path,
                affected.len()
            );
        }

        Ok(affected)
    }

    pub fn set_tag_pinned(
        repo: &dyn NoteRepository,
        input: SetTagPinnedInput,
    ) -> Result<(), NoteError> {
        let path = validate_tag_path(&input.path)?;
        if input.pinned && path.contains('/') {
            return Err(NoteError::TagNotPinnable);
        }
        log::info!("[tags] set pinned path={} pinned={}", path, input.pinned);
        let updated = repo.set_tag_pinned(&path, input.pinned)?;
        if updated == 0 {
            return Err(NoteError::TagNotFound);
        }
        Ok(())
    }

    pub fn set_hide_subtag_notes(
        repo: &dyn NoteRepository,
        input: SetHideSubtagNotesInput,
    ) -> Result<(), NoteError> {
        let path = validate_tag_path(&input.path)?;
        log::info!(
            "[tags] set hide_subtag_notes path={} hide_subtag_notes={}",
            path,
            input.hide_subtag_notes
        );
        let updated = repo.set_tag_hide_subtag_notes(&path, input.hide_subtag_notes)?;
        if updated == 0 {
            return Err(NoteError::TagNotFound);
        }
        Ok(())
    }

    pub fn archive_note(repo: &dyn NoteRepository, note_id: &str) -> Result<NoteRecord, NoteError> {
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

    pub fn restore_note(repo: &dyn NoteRepository, note_id: &str) -> Result<NoteRecord, NoteError> {
        validate_note_id(note_id)?;
        let now = now_millis();
        let updated = repo.restore_note(note_id, now)?;
        if updated == 0 {
            return Err(NoteError::NotFound);
        }
        repo.note_by_id(note_id)?.ok_or(NoteError::NotFound)
    }

    pub fn trash_note(repo: &dyn NoteRepository, note_id: &str) -> Result<NoteRecord, NoteError> {
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
    pub fn delete_permanently(repo: &dyn NoteRepository, note_id: &str) -> Result<(), NoteError> {
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

    pub fn search_tags(repo: &dyn NoteRepository, query: &str) -> Result<Vec<String>, NoteError> {
        repo.search_tags(query)
    }

    pub fn export_notes(
        repo: &dyn NoteRepository,
        mut input: ExportNotesInput,
    ) -> Result<usize, NoteError> {
        if input.export_dir.trim().is_empty() {
            return Err(NoteError::InvalidExportInput);
        }

        match input.export_mode {
            ExportModeInput::NoteFilter => {
                if input.note_filter.is_none() {
                    return Err(NoteError::InvalidExportInput);
                }
            }
            ExportModeInput::Tag => {
                let tag_path = input
                    .tag_path
                    .as_deref()
                    .ok_or(NoteError::InvalidExportInput)?;
                input.tag_path = Some(validate_tag_path(tag_path)?);
            }
        }

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
    use std::collections::{HashMap, HashSet};

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

    // ── Mock repository ─────────────────────────────────────────────────

    struct MockNoteRepository {
        notes: RefCell<HashMap<String, NoteRecord>>,
        last_open_note_id: RefCell<Option<String>>,
        pinned_tags: RefCell<HashSet<String>>,
        hide_subtag_notes_tags: RefCell<HashSet<String>>,
    }

    impl MockNoteRepository {
        fn new() -> Self {
            Self {
                notes: RefCell::new(HashMap::new()),
                last_open_note_id: RefCell::new(None),
                pinned_tags: RefCell::new(HashSet::new()),
                hide_subtag_notes_tags: RefCell::new(HashSet::new()),
            }
        }

        fn with_note(self, record: NoteRecord) -> Self {
            self.notes.borrow_mut().insert(record.id.clone(), record);
            self
        }
    }

    fn make_note(id: &str, markdown: &str) -> NoteRecord {
        NoteRecord {
            id: id.to_string(),
            title: id.to_string(),
            markdown: markdown.to_string(),
            modified_at: 1000,
            archived_at: None,
            deleted_at: None,
            pinned_at: None,
            readonly: false,
            nostr_d_tag: None,
            published_at: None,
            published_kind: None,
        }
    }

    impl NoteRepository for MockNoteRepository {
        fn note_by_id(&self, note_id: &str) -> Result<Option<NoteRecord>, NoteError> {
            Ok(self.notes.borrow().get(note_id).cloned())
        }

        fn note_is_active(&self, note_id: &str) -> Result<bool, NoteError> {
            let notes = self.notes.borrow();
            Ok(notes
                .get(note_id)
                .map_or(false, |n| n.archived_at.is_none() && n.deleted_at.is_none()))
        }

        fn next_active_note_id(
            &self,
            excluding: Option<&str>,
        ) -> Result<Option<String>, NoteError> {
            let notes = self.notes.borrow();
            Ok(notes
                .values()
                .find(|n| {
                    n.archived_at.is_none()
                        && n.deleted_at.is_none()
                        && excluding.map_or(true, |ex| n.id != ex)
                })
                .map(|n| n.id.clone()))
        }

        fn note_markdown(&self, note_id: &str) -> Result<String, NoteError> {
            let notes = self.notes.borrow();
            let record = notes.get(note_id).ok_or(NoteError::NotFound)?;
            Ok(record.markdown.clone())
        }

        fn insert_note(
            &self,
            note_id: &str,
            title: &str,
            markdown: &str,
            now: i64,
        ) -> Result<(), NoteError> {
            let record = NoteRecord {
                id: note_id.to_string(),
                title: title.to_string(),
                markdown: markdown.to_string(),
                modified_at: now,
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

        fn note_markdown_and_readonly(&self, note_id: &str) -> Result<(String, bool), NoteError> {
            let notes = self.notes.borrow();
            let record = notes.get(note_id).ok_or(NoteError::NotFound)?;
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

        fn note_ids_with_direct_tag_subtree(&self, path: &str) -> Result<Vec<String>, NoteError> {
            let notes = self.notes.borrow();
            let mut note_ids = notes
                .values()
                .filter(|record| {
                    extract_tags(&record.markdown)
                        .iter()
                        .any(|tag| tag == path || tag.starts_with(&format!("{path}/")))
                })
                .map(|record| record.id.clone())
                .collect::<Vec<_>>();
            note_ids.sort();
            Ok(note_ids)
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

        fn update_note_markdown_preserving_modified_at(
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

        fn set_readonly(
            &self,
            note_id: &str,
            readonly: bool,
            _now: i64,
        ) -> Result<usize, NoteError> {
            let mut notes = self.notes.borrow_mut();
            match notes.get_mut(note_id) {
                Some(record) => {
                    record.readonly = readonly;
                    Ok(1)
                }
                None => Ok(0),
            }
        }

        fn archive_note(&self, note_id: &str, now: i64) -> Result<usize, NoteError> {
            let mut notes = self.notes.borrow_mut();
            match notes.get_mut(note_id) {
                Some(record) => {
                    record.archived_at = Some(now);
                    Ok(1)
                }
                None => Ok(0),
            }
        }

        fn restore_note(&self, note_id: &str, _now: i64) -> Result<usize, NoteError> {
            let mut notes = self.notes.borrow_mut();
            match notes.get_mut(note_id) {
                Some(record) => {
                    record.archived_at = None;
                    Ok(1)
                }
                None => Ok(0),
            }
        }

        fn trash_note(&self, note_id: &str, now: i64) -> Result<usize, NoteError> {
            let mut notes = self.notes.borrow_mut();
            match notes.get_mut(note_id) {
                Some(record) => {
                    record.deleted_at = Some(now);
                    Ok(1)
                }
                None => Ok(0),
            }
        }

        fn restore_from_trash(&self, note_id: &str, _now: i64) -> Result<usize, NoteError> {
            let mut notes = self.notes.borrow_mut();
            match notes.get_mut(note_id) {
                Some(record) => {
                    record.deleted_at = None;
                    Ok(1)
                }
                None => Ok(0),
            }
        }

        fn pin_note(&self, note_id: &str, now: i64) -> Result<usize, NoteError> {
            let mut notes = self.notes.borrow_mut();
            match notes.get_mut(note_id) {
                Some(record) => {
                    record.pinned_at = Some(now);
                    Ok(1)
                }
                None => Ok(0),
            }
        }

        fn unpin_note(&self, note_id: &str, _now: i64) -> Result<usize, NoteError> {
            let mut notes = self.notes.borrow_mut();
            match notes.get_mut(note_id) {
                Some(record) => {
                    record.pinned_at = None;
                    Ok(1)
                }
                None => Ok(0),
            }
        }

        fn delete_note(&self, note_id: &str) -> Result<usize, NoteError> {
            match self.notes.borrow_mut().remove(note_id) {
                Some(_) => Ok(1),
                None => Ok(0),
            }
        }

        fn delete_search_document(&self, _note_id: &str) -> Result<(), NoteError> {
            Ok(())
        }

        fn tag_is_pinned(&self, path: &str) -> Result<bool, NoteError> {
            Ok(self.pinned_tags.borrow().contains(path))
        }

        fn set_tag_pinned(&self, path: &str, pinned: bool) -> Result<usize, NoteError> {
            let exists = self.notes.borrow().values().any(|record| {
                extract_tags(&record.markdown)
                    .iter()
                    .any(|tag| tag == path || tag.starts_with(&format!("{path}/")))
            }) || self.pinned_tags.borrow().contains(path);

            if !exists {
                return Ok(0);
            }

            let mut pinned_tags = self.pinned_tags.borrow_mut();
            if pinned {
                pinned_tags.insert(path.to_string());
            } else {
                pinned_tags.remove(path);
            }
            Ok(1)
        }

        fn set_tag_hide_subtag_notes(&self, path: &str, hide: bool) -> Result<usize, NoteError> {
            let exists = self.notes.borrow().values().any(|record| {
                extract_tags(&record.markdown)
                    .iter()
                    .any(|tag| tag == path || tag.starts_with(&format!("{path}/")))
            }) || self.hide_subtag_notes_tags.borrow().contains(path);

            if !exists {
                return Ok(0);
            }

            let mut hidden_tags = self.hide_subtag_notes_tags.borrow_mut();
            if hide {
                hidden_tags.insert(path.to_string());
            } else {
                hidden_tags.remove(path);
            }
            Ok(1)
        }

        fn trashed_note_ids(&self) -> Result<Vec<String>, NoteError> {
            let notes = self.notes.borrow();
            Ok(notes
                .values()
                .filter(|n| n.deleted_at.is_some())
                .map(|n| n.id.clone())
                .collect())
        }

        fn delete_trashed_notes(&self) -> Result<(), NoteError> {
            self.notes
                .borrow_mut()
                .retain(|_, n| n.deleted_at.is_none());
            Ok(())
        }

        // ── Remaining stubs ─────────────────────────────────────────────

        fn tags_for_note(&self, _: &str) -> Result<Vec<String>, NoteError> {
            unimplemented!()
        }
        fn archived_and_trashed_counts(&self) -> Result<(i64, i64), NoteError> {
            unimplemented!()
        }
        fn query_note_page(&self, _: &NoteQueryInput) -> Result<NotePagePayload, NoteError> {
            unimplemented!()
        }
        fn search_notes(&self, _: &str) -> Result<Vec<SearchResult>, NoteError> {
            unimplemented!()
        }
        fn search_tags(&self, _: &str) -> Result<Vec<String>, NoteError> {
            unimplemented!()
        }
        fn query_contextual_tags(
            &self,
            _: &ContextualTagsInput,
        ) -> Result<ContextualTagsPayload, NoteError> {
            unimplemented!()
        }
        fn todo_count(&self) -> Result<i64, NoteError> {
            unimplemented!()
        }
        fn export_notes(&self, _: &ExportNotesInput) -> Result<usize, NoteError> {
            unimplemented!()
        }
        fn current_npub(&self) -> Result<String, NoteError> {
            unimplemented!()
        }
    }

    // ── create_note ─────────────────────────────────────────────────────

    #[test]
    fn create_note_inserts_and_returns_record() {
        let repo = MockNoteRepository::new();

        let record =
            NoteService::create_note(&repo, &[], None).expect("create_note should succeed");

        assert!(record.id.starts_with("note-"));
        assert!(record.markdown.starts_with("# "));
        assert!(!record.readonly);
        // Verify it was stored
        assert!(repo.notes.borrow().contains_key(&record.id));
    }

    #[test]
    fn create_note_with_initial_markdown() {
        let repo = MockNoteRepository::new();

        let record = NoteService::create_note(&repo, &[], Some("# Imported\n\nContent here"))
            .expect("create_note should succeed");

        assert_eq!(record.title, "Imported");
        assert!(record.markdown.contains("Content here"));
    }

    #[test]
    fn create_note_sets_last_open_note_id() {
        let repo = MockNoteRepository::new();

        let record = NoteService::create_note(&repo, &[], None).unwrap();

        assert_eq!(
            repo.last_open_note_id.borrow().as_deref(),
            Some(record.id.as_str())
        );
    }

    #[test]
    fn create_note_renders_wrapped_tags_when_needed() {
        let repo = MockNoteRepository::new();

        let record = NoteService::create_note(
            &repo,
            &[
                "project alpha".to_string(),
                "work/project alpha".to_string(),
            ],
            None,
        )
        .expect("create_note should succeed");

        assert!(record.markdown.contains("#project alpha#"));
        assert!(record.markdown.contains("#work/project alpha#"));
    }

    // ── save_note ───────────────────────────────────────────────────────

    #[test]
    fn save_note_rejects_readonly_note() {
        let record = NoteRecord {
            id: "note-ro".to_string(),
            title: "Locked".to_string(),
            markdown: "# Locked".to_string(),
            modified_at: 1000,
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

    // ── load_note ──────────────────────────────────────────────────────

    #[test]
    fn load_note_returns_record_and_sets_last_open() {
        let repo = MockNoteRepository::new().with_note(make_note("n1", "# Hello"));

        let record = NoteService::load_note(&repo, "n1").unwrap();

        assert_eq!(record.id, "n1");
        assert_eq!(repo.last_open_note_id.borrow().as_deref(), Some("n1"));
    }

    #[test]
    fn load_note_not_found() {
        let repo = MockNoteRepository::new();

        let result = NoteService::load_note(&repo, "missing");

        assert!(matches!(result, Err(NoteError::NotFound)));
    }

    // ── duplicate_note ─────────────────────────────────────────────────

    #[test]
    fn duplicate_note_copies_markdown() {
        let repo = MockNoteRepository::new().with_note(make_note("orig", "# My Note\n\nBody text"));

        let dup = NoteService::duplicate_note(&repo, "orig").unwrap();

        assert_ne!(dup.id, "orig");
        assert_eq!(dup.markdown, "# My Note\n\nBody text");
    }

    // ── archive_note ───────────────────────────────────────────────────

    #[test]
    fn archive_note_sets_archived_and_navigates_away() {
        let repo = MockNoteRepository::new()
            .with_note(make_note("n1", "# One"))
            .with_note(make_note("n2", "# Two"));
        repo.set_last_open_note_id(Some("n1")).unwrap();

        let record = NoteService::archive_note(&repo, "n1").unwrap();

        assert!(record.archived_at.is_some());
        // last_open should have moved to n2
        assert_eq!(repo.last_open_note_id.borrow().as_deref(), Some("n2"));
    }

    // ── restore_note ───────────────────────────────────────────────────

    #[test]
    fn restore_note_clears_archived_at() {
        let mut note = make_note("n1", "# Archived");
        note.archived_at = Some(500);
        let repo = MockNoteRepository::new().with_note(note);

        let record = NoteService::restore_note(&repo, "n1").unwrap();

        assert!(record.archived_at.is_none());
    }

    // ── trash_note ─────────────────────────────────────────────────────

    #[test]
    fn trash_note_sets_deleted_and_navigates_away() {
        let repo = MockNoteRepository::new()
            .with_note(make_note("n1", "# One"))
            .with_note(make_note("n2", "# Two"));
        repo.set_last_open_note_id(Some("n1")).unwrap();

        let record = NoteService::trash_note(&repo, "n1").unwrap();

        assert!(record.deleted_at.is_some());
        assert_eq!(repo.last_open_note_id.borrow().as_deref(), Some("n2"));
    }

    // ── restore_from_trash ─────────────────────────────────────────────

    #[test]
    fn restore_from_trash_clears_deleted_at() {
        let mut note = make_note("n1", "# Trashed");
        note.deleted_at = Some(500);
        let repo = MockNoteRepository::new().with_note(note);

        let record = NoteService::restore_from_trash(&repo, "n1").unwrap();

        assert!(record.deleted_at.is_none());
    }

    // ── delete_permanently ─────────────────────────────────────────────

    #[test]
    fn delete_permanently_removes_note_and_navigates() {
        let repo = MockNoteRepository::new()
            .with_note(make_note("n1", "# One"))
            .with_note(make_note("n2", "# Two"));
        repo.set_last_open_note_id(Some("n1")).unwrap();

        NoteService::delete_permanently(&repo, "n1").unwrap();

        assert!(repo.notes.borrow().get("n1").is_none());
        assert_eq!(repo.last_open_note_id.borrow().as_deref(), Some("n2"));
    }

    #[test]
    fn delete_permanently_not_found() {
        let repo = MockNoteRepository::new();

        let result = NoteService::delete_permanently(&repo, "missing");

        assert!(matches!(result, Err(NoteError::NotFound)));
    }

    // ── empty_trash ────────────────────────────────────────────────────

    #[test]
    fn empty_trash_returns_deleted_ids() {
        let mut trashed = make_note("t1", "# Trashed");
        trashed.deleted_at = Some(100);
        let repo = MockNoteRepository::new()
            .with_note(trashed)
            .with_note(make_note("active", "# Active"));

        let ids = NoteService::empty_trash(&repo).unwrap();

        assert_eq!(ids, vec!["t1"]);
        // trashed note removed, active note still present
        assert!(repo.notes.borrow().get("t1").is_none());
        assert!(repo.notes.borrow().get("active").is_some());
    }

    // ── pin_note / unpin_note ──────────────────────────────────────────

    #[test]
    fn pin_note_sets_pinned_at() {
        let repo = MockNoteRepository::new().with_note(make_note("n1", "# Pin me"));

        let record = NoteService::pin_note(&repo, "n1").unwrap();

        assert!(record.pinned_at.is_some());
    }

    #[test]
    fn unpin_note_clears_pinned_at() {
        let mut note = make_note("n1", "# Pinned");
        note.pinned_at = Some(500);
        let repo = MockNoteRepository::new().with_note(note);

        let record = NoteService::unpin_note(&repo, "n1").unwrap();

        assert!(record.pinned_at.is_none());
    }

    // ── set_readonly ───────────────────────────────────────────────────

    #[test]
    fn set_readonly_updates_flag() {
        let repo = MockNoteRepository::new().with_note(make_note("n1", "# Editable"));

        let record = NoteService::set_readonly(
            &repo,
            SetNoteReadonlyInput {
                note_id: "n1".to_string(),
                readonly: true,
            },
        )
        .unwrap();

        assert!(record.readonly);
    }

    #[test]
    fn rename_tag_rewrites_matching_notes_without_touching_modified_at() {
        let repo = MockNoteRepository::new().with_note(make_note(
            "n1",
            "# Hello\n\n#work/project alpha# and #work/project alpha#",
        ));
        let original_modified_at = repo.notes.borrow()["n1"].modified_at;

        let affected = NoteService::rename_tag(
            &repo,
            RenameTagInput {
                from_path: "work/project alpha".to_string(),
                to_path: "work/client alpha".to_string(),
            },
        )
        .unwrap();

        let note = repo.notes.borrow()["n1"].clone();
        assert_eq!(affected, vec!["n1".to_string()]);
        assert_eq!(note.modified_at, original_modified_at);
        assert!(note.markdown.contains("#work/client alpha#"));
        assert!(!note.markdown.contains("#work/project alpha#"));
    }

    #[test]
    fn delete_tag_removes_matching_tag_from_notes() {
        let repo = MockNoteRepository::new().with_note(make_note(
            "n1",
            "# Hello\n\n#work/project alpha# #work/client beta#",
        ));

        let affected = NoteService::delete_tag(
            &repo,
            DeleteTagInput {
                path: "work/project alpha".to_string(),
            },
        )
        .unwrap();

        let note = repo.notes.borrow()["n1"].clone();
        assert_eq!(affected, vec!["n1".to_string()]);
        assert!(!note.markdown.contains("#work/project alpha#"));
        assert!(note.markdown.contains("#work/client beta#"));
    }

    #[test]
    fn rename_tag_rewrites_descendant_tags_in_subtree() {
        let repo = MockNoteRepository::new().with_note(make_note(
            "n1",
            "# Hello\n\n#work/project alpha# #work/client beta#",
        ));

        let affected = NoteService::rename_tag(
            &repo,
            RenameTagInput {
                from_path: "work".to_string(),
                to_path: "personal".to_string(),
            },
        )
        .unwrap();

        let note = repo.notes.borrow()["n1"].clone();
        assert_eq!(affected, vec!["n1".to_string()]);
        assert!(note.markdown.contains("#personal/project alpha#"));
        assert!(note.markdown.contains("#personal/client beta#"));
        assert!(!note.markdown.contains("#work/project alpha#"));
        assert!(!note.markdown.contains("#work/client beta#"));
    }

    #[test]
    fn rename_tag_preserves_pinned_state() {
        let repo =
            MockNoteRepository::new().with_note(make_note("n1", "# Hello\n\n#work/project alpha#"));

        NoteService::set_tag_pinned(
            &repo,
            SetTagPinnedInput {
                path: "work".to_string(),
                pinned: true,
            },
        )
        .unwrap();

        let affected = NoteService::rename_tag(
            &repo,
            RenameTagInput {
                from_path: "work".to_string(),
                to_path: "personal".to_string(),
            },
        )
        .unwrap();

        assert_eq!(affected, vec!["n1".to_string()]);
        assert!(!repo.pinned_tags.borrow().contains("work"));
        assert!(repo.pinned_tags.borrow().contains("personal"));
    }

    #[test]
    fn delete_tag_removes_descendant_tags_in_subtree() {
        let repo = MockNoteRepository::new()
            .with_note(make_note("n1", "# Hello\n\n#work/project alpha# #roadmap"));

        let affected = NoteService::delete_tag(
            &repo,
            DeleteTagInput {
                path: "work".to_string(),
            },
        )
        .unwrap();

        let note = repo.notes.borrow()["n1"].clone();
        assert_eq!(affected, vec!["n1".to_string()]);
        assert!(!note.markdown.contains("#work/project alpha#"));
        assert!(note.markdown.contains("#roadmap"));
    }

    #[test]
    fn rename_tag_rejects_readonly_notes() {
        let mut note = make_note("n1", "# Hello\n\n#work/project alpha#");
        note.readonly = true;
        let repo = MockNoteRepository::new().with_note(note);

        let result = NoteService::rename_tag(
            &repo,
            RenameTagInput {
                from_path: "work/project alpha".to_string(),
                to_path: "work/client alpha".to_string(),
            },
        );

        assert!(matches!(result, Err(NoteError::ReadOnly)));
    }

    #[test]
    fn set_tag_pinned_rejects_subtags() {
        let repo =
            MockNoteRepository::new().with_note(make_note("n1", "# Hello\n\n#work/project alpha#"));

        let result = NoteService::set_tag_pinned(
            &repo,
            SetTagPinnedInput {
                path: "work/project alpha".to_string(),
                pinned: true,
            },
        );

        assert!(matches!(result, Err(NoteError::TagNotPinnable)));
    }

    #[test]
    fn set_tag_pinned_updates_root_tag_metadata() {
        let repo = MockNoteRepository::new().with_note(make_note("n1", "# Hello\n\n#work"));

        NoteService::set_tag_pinned(
            &repo,
            SetTagPinnedInput {
                path: "work".to_string(),
                pinned: true,
            },
        )
        .unwrap();

        assert!(repo.pinned_tags.borrow().contains("work"));
    }

    #[test]
    fn set_hide_subtag_notes_updates_tag_metadata() {
        let repo =
            MockNoteRepository::new().with_note(make_note("n1", "# Hello\n\n#work/project alpha#"));

        NoteService::set_hide_subtag_notes(
            &repo,
            SetHideSubtagNotesInput {
                path: "work/project alpha".to_string(),
                hide_subtag_notes: true,
            },
        )
        .unwrap();

        assert!(repo
            .hide_subtag_notes_tags
            .borrow()
            .contains("work/project alpha"));
    }
}

use crate::domain::common::text::{
    canonicalize_tag_path, extract_tags, extract_wikilink_occurrences, render_tag_token,
    rewrite_tag_path_in_markdown, rewrite_wikilink_titles_with_locations, title_from_markdown,
    WikiLinkTitleRewrite,
};
use crate::domain::common::time::now_millis;
use crate::domain::notes::error::NoteError;
use crate::domain::notes::model::*;
use crate::ports::note_repository::{NoteRecord, NoteRepository};
use std::collections::BTreeMap;
use uuid::Uuid;

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
    Uuid::new_v4().hyphenated().to_string().to_uppercase()
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

fn sort_wikilink_resolutions(resolutions: &mut [WikiLinkResolutionInput]) {
    resolutions.sort_by(|left, right| {
        left.location
            .cmp(&right.location)
            .then_with(|| left.title.cmp(&right.title))
            .then_with(|| left.target_note_id.cmp(&right.target_note_id))
            .then_with(|| left.occurrence_id.cmp(&right.occurrence_id))
    });
}

fn dedupe_wikilink_resolutions(resolutions: &mut Vec<WikiLinkResolutionInput>) {
    sort_wikilink_resolutions(resolutions);
    resolutions.dedup_by(|left, right| {
        left.location == right.location
            && left.title == right.title
            && left.target_note_id == right.target_note_id
    });
}

fn project_wikilink_rewrites_onto_markdown(
    previous_markdown: &str,
    next_markdown: &str,
    rewrites: &[WikiLinkTitleRewrite],
) -> Vec<(usize, WikiLinkTitleRewrite)> {
    if rewrites.is_empty() {
        return Vec::new();
    }

    let previous_occurrences = extract_wikilink_occurrences(previous_markdown);
    let next_occurrences = extract_wikilink_occurrences(next_markdown);

    let previous_by_title = previous_occurrences.iter().fold(
        BTreeMap::<String, Vec<_>>::new(),
        |mut groups, occurrence| {
            groups
                .entry(occurrence.normalized_title.clone())
                .or_default()
                .push(occurrence);
            groups
        },
    );
    let next_by_title = next_occurrences.iter().fold(
        BTreeMap::<String, Vec<_>>::new(),
        |mut groups, occurrence| {
            groups
                .entry(occurrence.normalized_title.clone())
                .or_default()
                .push(occurrence);
            groups
        },
    );

    rewrites
        .iter()
        .filter_map(|rewrite| {
            let normalized_title =
                crate::domain::common::text::normalize_wikilink_title(&rewrite.current_title)?;
            let previous_group = previous_by_title.get(&normalized_title)?;
            let next_group = next_by_title.get(&normalized_title)?;
            let previous_index = previous_group.iter().position(|occurrence| {
                occurrence.start == rewrite.location && occurrence.title == rewrite.current_title
            })?;
            let next_occurrence = if previous_group.len() == next_group.len() {
                next_group.get(previous_index).copied()
            } else {
                next_group.iter().copied().find(|occurrence| {
                    occurrence.start == rewrite.location
                        && occurrence.title == rewrite.current_title
                })
            }?;

            Some((
                rewrite.location,
                WikiLinkTitleRewrite {
                    location: next_occurrence.start,
                    current_title: next_occurrence.title.clone(),
                    new_title: rewrite.new_title.clone(),
                },
            ))
        })
        .collect()
}

fn pin_rewritten_wikilink_resolutions(
    resolutions: &mut Vec<WikiLinkResolutionInput>,
    target_note_id: &str,
    rewritten_locations: &[(usize, usize, String)],
) {
    for resolution in resolutions.iter_mut() {
        if resolution.target_note_id != target_note_id {
            continue;
        }

        if let Some((_, new_location, new_title)) = rewritten_locations
            .iter()
            .find(|(old_location, _, _)| *old_location == resolution.location)
        {
            resolution.location = *new_location;
            resolution.title = new_title.clone();
            resolution.is_explicit = true;
        }
    }

    for (_old_location, new_location, new_title) in rewritten_locations {
        let already_matched = resolutions.iter().any(|resolution| {
            resolution.target_note_id == target_note_id
                && resolution.location == *new_location
                && resolution.title == *new_title
        });
        if already_matched {
            continue;
        }

        resolutions.push(WikiLinkResolutionInput {
            occurrence_id: None,
            is_explicit: true,
            location: *new_location,
            target_note_id: target_note_id.to_string(),
            title: new_title.clone(),
        });
    }

    dedupe_wikilink_resolutions(resolutions);
}

fn rewrite_inbound_wikilink_titles(
    repo: &dyn NoteRepository,
    target_note_id: &str,
    new_title: &str,
) -> Result<Vec<String>, NoteError> {
    let backlinks = repo.backlinks_for_note(target_note_id)?;
    if backlinks.is_empty() {
        return Ok(Vec::new());
    }

    let rewrite_groups = backlinks.into_iter().fold(
        BTreeMap::<String, Vec<WikiLinkTitleRewrite>>::new(),
        |mut groups, backlink| {
            if backlink.source_note_id != target_note_id {
                groups
                    .entry(backlink.source_note_id)
                    .or_default()
                    .push(WikiLinkTitleRewrite {
                        location: backlink.location,
                        current_title: backlink.title,
                        new_title: new_title.to_string(),
                    });
            }
            groups
        },
    );

    if rewrite_groups.is_empty() {
        return Ok(Vec::new());
    }

    let rewrite_now = now_millis();
    let mut affected_note_ids = Vec::new();

    for (source_note_id, rewrites) in rewrite_groups {
        let markdown = repo.note_markdown(&source_note_id)?;
        let (rewritten, applied_rewrites) =
            rewrite_wikilink_titles_with_locations(&markdown, &rewrites);
        if rewritten == markdown {
            continue;
        }

        let title = title_from_markdown(&rewritten);
        let mut wikilink_resolutions = repo.wikilink_resolutions_for_note(&source_note_id)?;
        pin_rewritten_wikilink_resolutions(
            &mut wikilink_resolutions,
            target_note_id,
            &applied_rewrites
                .iter()
                .map(|rewrite| {
                    (
                        rewrite.old_location,
                        rewrite.new_location,
                        rewrite.new_title.clone(),
                    )
                })
                .collect::<Vec<_>>(),
        );

        repo.update_note_markdown_preserving_edited_at(
            &source_note_id,
            &title,
            &rewritten,
            rewrite_now,
        )?;
        repo.upsert_search_document(&source_note_id, &title, &rewritten)?;
        repo.replace_tags(&source_note_id, &rewritten)?;
        repo.replace_wikilinks(&source_note_id, &rewritten, &wikilink_resolutions)?;
        affected_note_ids.push(source_note_id);
    }

    Ok(affected_note_ids)
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
        Self::create_note_with_wikilinks(repo, tags, initial_markdown, &[])
    }

    fn create_note_with_wikilinks(
        repo: &dyn NoteRepository,
        tags: &[String],
        initial_markdown: Option<&str>,
        wikilink_resolutions: &[WikiLinkResolutionInput],
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
        repo.replace_wikilinks(&note_id, &markdown, wikilink_resolutions)?;
        repo.refresh_wikilink_targets(std::slice::from_ref(&title))?;
        repo.set_last_open_note_id(Some(&note_id))?;

        repo.note_by_id(&note_id)?.ok_or(NoteError::NotFound)
    }

    pub fn duplicate_note(
        repo: &dyn NoteRepository,
        note_id: &str,
    ) -> Result<NoteRecord, NoteError> {
        validate_note_id(note_id)?;
        let markdown = repo.note_markdown(note_id)?;
        let wikilink_resolutions = repo
            .wikilink_resolutions_for_note(note_id)?
            .into_iter()
            .map(|resolution| WikiLinkResolutionInput {
                occurrence_id: None,
                ..resolution
            })
            .collect::<Vec<_>>();
        Self::create_note_with_wikilinks(repo, &[], Some(&markdown), &wikilink_resolutions)
    }

    /// Returns `(record, note_changed, affected_linked_note_ids)`.
    pub fn save_note(
        repo: &dyn NoteRepository,
        input: SaveNoteInput,
    ) -> Result<(NoteRecord, bool, Vec<String>), NoteError> {
        log::info!(
            "[wikilinks] save_note id={} wikilink_resolution_count={}",
            input.id,
            input.wikilink_resolutions.as_ref().map_or(0, Vec::len)
        );
        for resolution in input.wikilink_resolutions.iter().flatten() {
            log::info!(
                "[wikilinks] save_note resolution id={} occurrence_id={:?} location={} title={} target_note_id={}",
                input.id,
                resolution.occurrence_id,
                resolution.location,
                resolution.title,
                resolution.target_note_id
            );
        }

        validate_note_id(&input.id)?;
        let existing = repo.note_by_id(&input.id)?.ok_or(NoteError::NotFound)?;
        let existing_markdown = existing.markdown.clone();
        let previous_title = existing.title;
        let mut existing_wikilink_resolutions = repo.wikilink_resolutions_for_note(&input.id)?;
        let is_readonly = existing.readonly;
        if is_readonly {
            return Err(NoteError::ReadOnly);
        }

        let requested_title = title_from_markdown(&input.markdown);
        let mut next_wikilink_resolutions = input
            .wikilink_resolutions
            .clone()
            .unwrap_or_else(|| existing_wikilink_resolutions.clone());
        let mut next_markdown = input.markdown.clone();
        if previous_title != requested_title {
            let self_rewrites = repo
                .backlinks_for_note(&input.id)?
                .into_iter()
                .filter(|backlink| backlink.source_note_id == input.id)
                .map(|backlink| WikiLinkTitleRewrite {
                    location: backlink.location,
                    current_title: backlink.title,
                    new_title: requested_title.clone(),
                })
                .collect::<Vec<_>>();
            let projected_self_rewrites = project_wikilink_rewrites_onto_markdown(
                &existing_markdown,
                &next_markdown,
                &self_rewrites,
            );
            let projected_rewrite_inputs = projected_self_rewrites
                .iter()
                .map(|(_, rewrite)| rewrite.clone())
                .collect::<Vec<_>>();
            let (rewritten_markdown, _) =
                rewrite_wikilink_titles_with_locations(&next_markdown, &projected_rewrite_inputs);
            if rewritten_markdown != next_markdown {
                next_markdown = rewritten_markdown;
                pin_rewritten_wikilink_resolutions(
                    &mut next_wikilink_resolutions,
                    &input.id,
                    &projected_self_rewrites
                        .iter()
                        .map(|(old_location, rewrite)| {
                            (*old_location, rewrite.location, rewrite.new_title.clone())
                        })
                        .collect::<Vec<_>>(),
                );
            }
        }
        let title = title_from_markdown(&next_markdown);
        let markdown_changed = existing_markdown != next_markdown;
        sort_wikilink_resolutions(&mut existing_wikilink_resolutions);
        sort_wikilink_resolutions(&mut next_wikilink_resolutions);
        let wikilink_metadata_changed = existing_wikilink_resolutions != next_wikilink_resolutions;
        let note_changed = markdown_changed || wikilink_metadata_changed;

        if note_changed {
            let now = now_millis();
            repo.update_note_content(&input.id, &title, &next_markdown, now)?;
        } else {
            repo.update_note_title_only(&input.id, &title, &next_markdown)?;
        }

        repo.upsert_search_document(&input.id, &title, &next_markdown)?;
        repo.replace_tags(&input.id, &next_markdown)?;
        repo.replace_wikilinks(&input.id, &next_markdown, &next_wikilink_resolutions)?;
        let affected_linked_note_ids = if previous_title != title {
            rewrite_inbound_wikilink_titles(repo, &input.id, &title)?
        } else {
            Vec::new()
        };
        repo.refresh_wikilink_targets(&[previous_title, title.clone()])?;
        repo.set_last_open_note_id(Some(&input.id))?;

        let record = repo.note_by_id(&input.id)?.ok_or(NoteError::NotFound)?;
        Ok((record, note_changed, affected_linked_note_ids))
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

    pub fn set_tag_icon(
        repo: &dyn NoteRepository,
        input: SetTagIconInput,
    ) -> Result<(), NoteError> {
        let path = validate_tag_path(&input.path)?;
        log::info!("[tags] set icon path={} icon={:?}", path, input.icon);
        let updated = repo.set_tag_icon(&path, input.icon.as_deref())?;
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

    pub fn search_note_titles(
        repo: &dyn NoteRepository,
        query: &str,
    ) -> Result<Vec<SearchResult>, NoteError> {
        repo.search_note_titles(query)
    }

    pub fn search_tags(repo: &dyn NoteRepository, query: &str) -> Result<Vec<String>, NoteError> {
        repo.search_tags(query)
    }

    pub fn backlinks_for_note(
        repo: &dyn NoteRepository,
        note_id: &str,
    ) -> Result<Vec<NoteBacklink>, NoteError> {
        validate_note_id(note_id)?;
        repo.backlinks_for_note(note_id)
    }

    pub fn resolve_wikilink(
        repo: &dyn NoteRepository,
        input: ResolveWikilinkInput,
    ) -> Result<Option<String>, NoteError> {
        validate_note_id(&input.source_note_id)?;
        repo.resolve_wikilink(&input)
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
        wikilinks: RefCell<HashMap<String, Vec<WikiLinkResolutionInput>>>,
        last_open_note_id: RefCell<Option<String>>,
        pinned_tags: RefCell<HashSet<String>>,
        hide_subtag_notes_tags: RefCell<HashSet<String>>,
    }

    impl MockNoteRepository {
        fn new() -> Self {
            Self {
                notes: RefCell::new(HashMap::new()),
                wikilinks: RefCell::new(HashMap::new()),
                last_open_note_id: RefCell::new(None),
                pinned_tags: RefCell::new(HashSet::new()),
                hide_subtag_notes_tags: RefCell::new(HashSet::new()),
            }
        }

        fn with_note(self, record: NoteRecord) -> Self {
            self.notes.borrow_mut().insert(record.id.clone(), record);
            self
        }

        fn with_wikilink_resolutions(
            self,
            note_id: &str,
            resolutions: Vec<WikiLinkResolutionInput>,
        ) -> Self {
            self.wikilinks
                .borrow_mut()
                .insert(note_id.to_string(), resolutions);
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

        fn wikilink_resolutions_for_note(
            &self,
            note_id: &str,
        ) -> Result<Vec<WikiLinkResolutionInput>, NoteError> {
            Ok(self
                .wikilinks
                .borrow()
                .get(note_id)
                .cloned()
                .unwrap_or_default())
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

        fn replace_wikilinks(
            &self,
            note_id: &str,
            _markdown: &str,
            resolutions: &[WikiLinkResolutionInput],
        ) -> Result<(), NoteError> {
            self.wikilinks
                .borrow_mut()
                .insert(note_id.to_string(), resolutions.to_vec());
            Ok(())
        }

        fn refresh_wikilink_targets(&self, _titles: &[String]) -> Result<(), NoteError> {
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

        fn update_note_markdown_preserving_edited_at(
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

        fn set_tag_icon(&self, _path: &str, _icon: Option<&str>) -> Result<usize, NoteError> {
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
        fn search_note_titles(&self, _: &str) -> Result<Vec<SearchResult>, NoteError> {
            unimplemented!()
        }
        fn search_tags(&self, _: &str) -> Result<Vec<String>, NoteError> {
            unimplemented!()
        }
        fn backlinks_for_note(&self, note_id: &str) -> Result<Vec<NoteBacklink>, NoteError> {
            let notes = self.notes.borrow();
            let wikilinks = self.wikilinks.borrow();
            let mut backlinks = wikilinks
                .iter()
                .flat_map(|(source_note_id, resolutions)| {
                    resolutions.iter().filter_map(|resolution| {
                        (resolution.target_note_id == note_id).then(|| {
                            let source_note = notes.get(source_note_id)?;
                            Some(NoteBacklink {
                                source_note_id: source_note_id.clone(),
                                source_title: source_note.title.clone(),
                                source_preview: String::new(),
                                title: resolution.title.clone(),
                                location: resolution.location,
                            })
                        })?
                    })
                })
                .collect::<Vec<_>>();
            backlinks.sort_by(|left, right| {
                left.source_note_id
                    .cmp(&right.source_note_id)
                    .then_with(|| left.location.cmp(&right.location))
                    .then_with(|| left.title.cmp(&right.title))
            });
            Ok(backlinks)
        }
        fn resolve_wikilink(
            &self,
            input: &ResolveWikilinkInput,
        ) -> Result<Option<String>, NoteError> {
            let notes = self.notes.borrow();
            let mut matches = notes
                .values()
                .filter(|record| record.title.eq_ignore_ascii_case(&input.title))
                .map(|record| record.id.clone())
                .collect::<Vec<_>>();
            matches.sort();
            Ok((matches.len() == 1).then(|| matches[0].clone()))
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

        let parsed = Uuid::parse_str(&record.id).expect("note id should be a UUID");
        assert_eq!(parsed.get_version_num(), 4);
        assert_eq!(record.id, record.id.to_uppercase());
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
    fn create_note_renders_simple_tags() {
        let repo = MockNoteRepository::new();

        let record = NoteService::create_note(
            &repo,
            &[
                "project-alpha".to_string(),
                "work/project-alpha".to_string(),
            ],
            None,
        )
        .expect("create_note should succeed");

        assert!(record.markdown.contains("#project-alpha"));
        assert!(record.markdown.contains("#work/project-alpha"));
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
                wikilink_resolutions: Some(Vec::new()),
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

        let (_, changed, _) = NoteService::save_note(
            &repo,
            SaveNoteInput {
                id: "note-1".to_string(),
                markdown: "# Original\n\nNew body".to_string(),
                wikilink_resolutions: Some(Vec::new()),
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

        let (_, changed, _) = NoteService::save_note(
            &repo,
            SaveNoteInput {
                id: "note-2".to_string(),
                markdown,
                wikilink_resolutions: Some(Vec::new()),
            },
        )
        .expect("save should succeed");

        assert!(!changed);
    }

    #[test]
    fn save_note_detects_wikilink_resolution_only_change() {
        let markdown = "# Same\n\n[[Alpha]]".to_string();
        let record = NoteRecord {
            id: "note-3".to_string(),
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
        let repo = MockNoteRepository::new()
            .with_note(record)
            .with_wikilink_resolutions(
                "note-3",
                vec![WikiLinkResolutionInput {
                    occurrence_id: Some("A1".to_string()),
                    is_explicit: true,
                    location: 8,
                    target_note_id: "target-old".to_string(),
                    title: "Alpha".to_string(),
                }],
            );

        let (saved, changed, _) = NoteService::save_note(
            &repo,
            SaveNoteInput {
                id: "note-3".to_string(),
                markdown,
                wikilink_resolutions: Some(vec![WikiLinkResolutionInput {
                    occurrence_id: Some("A1".to_string()),
                    is_explicit: true,
                    location: 8,
                    target_note_id: "target-new".to_string(),
                    title: "Alpha".to_string(),
                }]),
            },
        )
        .expect("save should succeed");

        assert!(changed);
        assert!(saved.modified_at > 1000);
        let resolutions = repo.wikilink_resolutions_for_note("note-3").unwrap();
        assert_eq!(resolutions.len(), 1);
        assert_eq!(resolutions[0].target_note_id, "target-new");
    }

    #[test]
    fn save_note_preserves_existing_wikilink_resolutions_when_omitted() {
        let markdown = "# Same\n\n[[Alpha]]".to_string();
        let record = NoteRecord {
            id: "note-4".to_string(),
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
        let repo = MockNoteRepository::new()
            .with_note(record)
            .with_wikilink_resolutions(
                "note-4",
                vec![WikiLinkResolutionInput {
                    occurrence_id: Some("A1".to_string()),
                    is_explicit: true,
                    location: 8,
                    target_note_id: "target-a".to_string(),
                    title: "Alpha".to_string(),
                }],
            );

        let (_, changed, _) = NoteService::save_note(
            &repo,
            SaveNoteInput {
                id: "note-4".to_string(),
                markdown: "# Same\n\nBody\n\n[[Alpha]]".to_string(),
                wikilink_resolutions: None,
            },
        )
        .expect("save should succeed");

        assert!(changed);
        let resolutions = repo.wikilink_resolutions_for_note("note-4").unwrap();
        assert_eq!(resolutions.len(), 1);
        assert_eq!(resolutions[0].target_note_id, "target-a");
    }

    #[test]
    fn save_note_renames_inbound_wikilinks_and_returns_affected_note_ids() {
        let target = NoteRecord {
            id: "target".to_string(),
            title: "Alpha".to_string(),
            markdown: "# Alpha\n\nBody".to_string(),
            modified_at: 1000,
            archived_at: None,
            deleted_at: None,
            pinned_at: None,
            readonly: false,
            nostr_d_tag: None,
            published_at: None,
            published_kind: None,
        };
        let source = NoteRecord {
            id: "source".to_string(),
            title: "Source".to_string(),
            markdown: "# Source\n\nSee [[Alpha]]".to_string(),
            modified_at: 1000,
            archived_at: None,
            deleted_at: None,
            pinned_at: None,
            readonly: false,
            nostr_d_tag: None,
            published_at: None,
            published_kind: None,
        };
        let repo = MockNoteRepository::new()
            .with_note(target)
            .with_note(source)
            .with_wikilink_resolutions(
                "source",
                vec![WikiLinkResolutionInput {
                    occurrence_id: Some("S1".to_string()),
                    is_explicit: true,
                    location: 14,
                    target_note_id: "target".to_string(),
                    title: "Alpha".to_string(),
                }],
            );
        let original_source_modified_at = repo.notes.borrow()["source"].modified_at;

        let (_, changed, affected_note_ids) = NoteService::save_note(
            &repo,
            SaveNoteInput {
                id: "target".to_string(),
                markdown: "# Beta\n\nBody".to_string(),
                wikilink_resolutions: Some(Vec::new()),
            },
        )
        .expect("save should succeed");

        let source_note = repo.notes.borrow()["source"].clone();
        let source_resolutions = repo.wikilink_resolutions_for_note("source").unwrap();

        assert!(changed);
        assert_eq!(affected_note_ids, vec!["source".to_string()]);
        assert_eq!(source_note.markdown, "# Source\n\nSee [[Beta]]");
        assert!(source_note.modified_at > original_source_modified_at);
        assert_eq!(source_resolutions[0].title, "Beta");
        assert_eq!(source_resolutions[0].target_note_id, "target");
    }

    #[test]
    fn save_note_rewrites_self_wikilinks_before_reindexing() {
        let note = NoteRecord {
            id: "self".to_string(),
            title: "Alpha".to_string(),
            markdown: "# Alpha\n\nSee [[Alpha]]".to_string(),
            modified_at: 1000,
            archived_at: None,
            deleted_at: None,
            pinned_at: None,
            readonly: false,
            nostr_d_tag: None,
            published_at: None,
            published_kind: None,
        };
        let repo = MockNoteRepository::new()
            .with_note(note)
            .with_wikilink_resolutions(
                "self",
                vec![WikiLinkResolutionInput {
                    occurrence_id: Some("SELF1".to_string()),
                    is_explicit: true,
                    location: 13,
                    target_note_id: "self".to_string(),
                    title: "Alpha".to_string(),
                }],
            );

        let (saved, changed, affected_note_ids) = NoteService::save_note(
            &repo,
            SaveNoteInput {
                id: "self".to_string(),
                markdown: "# Beta\n\nSee [[Alpha]]".to_string(),
                wikilink_resolutions: None,
            },
        )
        .expect("save should succeed");

        let resolutions = repo.wikilink_resolutions_for_note("self").unwrap();

        assert!(changed);
        assert!(affected_note_ids.is_empty());
        assert_eq!(saved.markdown, "# Beta\n\nSee [[Beta]]");
        assert_eq!(resolutions.len(), 1);
        assert_eq!(resolutions[0].title, "Beta");
        assert_eq!(resolutions[0].target_note_id, "self");
    }

    #[test]
    fn save_note_rejects_invalid_id() {
        let repo = MockNoteRepository::new();

        let result = NoteService::save_note(
            &repo,
            SaveNoteInput {
                id: "../escape".to_string(),
                markdown: "# Hack".to_string(),
                wikilink_resolutions: Some(Vec::new()),
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

    #[test]
    fn duplicate_note_preserves_explicit_wikilink_targets_without_occurrence_ids() {
        let repo = MockNoteRepository::new()
            .with_note(make_note("orig", "# My Note\n\n[[Alpha]]"))
            .with_wikilink_resolutions(
                "orig",
                vec![WikiLinkResolutionInput {
                    occurrence_id: Some("OCC1".to_string()),
                    is_explicit: true,
                    location: 10,
                    target_note_id: "target-a".to_string(),
                    title: "Alpha".to_string(),
                }],
            );

        let dup = NoteService::duplicate_note(&repo, "orig").unwrap();
        let duplicated_resolutions = repo.wikilink_resolutions_for_note(&dup.id).unwrap();

        assert_eq!(duplicated_resolutions.len(), 1);
        assert_eq!(duplicated_resolutions[0].target_note_id, "target-a");
        assert_eq!(duplicated_resolutions[0].title, "Alpha");
        assert_eq!(duplicated_resolutions[0].location, 10);
        assert_eq!(duplicated_resolutions[0].occurrence_id, None);
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
            "# Hello\n\n#work/project-alpha #work/project-alpha",
        ));
        let original_modified_at = repo.notes.borrow()["n1"].modified_at;

        let affected = NoteService::rename_tag(
            &repo,
            RenameTagInput {
                from_path: "work/project-alpha".to_string(),
                to_path: "work/client-alpha".to_string(),
            },
        )
        .unwrap();

        let note = repo.notes.borrow()["n1"].clone();
        assert_eq!(affected, vec!["n1".to_string()]);
        assert_eq!(note.modified_at, original_modified_at);
        assert!(note.markdown.contains("#work/client-alpha"));
        assert!(!note.markdown.contains("#work/project-alpha"));
    }

    #[test]
    fn delete_tag_removes_matching_tag_from_notes() {
        let repo = MockNoteRepository::new().with_note(make_note(
            "n1",
            "# Hello\n\n#work/project-alpha #work/client-beta",
        ));

        let affected = NoteService::delete_tag(
            &repo,
            DeleteTagInput {
                path: "work/project-alpha".to_string(),
            },
        )
        .unwrap();

        let note = repo.notes.borrow()["n1"].clone();
        assert_eq!(affected, vec!["n1".to_string()]);
        assert!(!note.markdown.contains("#work/project-alpha"));
        assert!(note.markdown.contains("#work/client-beta"));
    }

    #[test]
    fn rename_tag_rewrites_descendant_tags_in_subtree() {
        let repo = MockNoteRepository::new().with_note(make_note(
            "n1",
            "# Hello\n\n#work/project-alpha #work/client-beta",
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
        assert!(note.markdown.contains("#personal/project-alpha"));
        assert!(note.markdown.contains("#personal/client-beta"));
        assert!(!note.markdown.contains("#work/project-alpha"));
        assert!(!note.markdown.contains("#work/client-beta"));
    }

    #[test]
    fn rename_tag_preserves_pinned_state() {
        let repo =
            MockNoteRepository::new().with_note(make_note("n1", "# Hello\n\n#work/project-alpha"));

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
            .with_note(make_note("n1", "# Hello\n\n#work/project-alpha #roadmap"));

        let affected = NoteService::delete_tag(
            &repo,
            DeleteTagInput {
                path: "work".to_string(),
            },
        )
        .unwrap();

        let note = repo.notes.borrow()["n1"].clone();
        assert_eq!(affected, vec!["n1".to_string()]);
        assert!(!note.markdown.contains("#work/project-alpha"));
        assert!(note.markdown.contains("#roadmap"));
    }

    #[test]
    fn rename_tag_rejects_readonly_notes() {
        let mut note = make_note("n1", "# Hello\n\n#work/project-alpha");
        note.readonly = true;
        let repo = MockNoteRepository::new().with_note(note);

        let result = NoteService::rename_tag(
            &repo,
            RenameTagInput {
                from_path: "work/project-alpha".to_string(),
                to_path: "work/client-alpha".to_string(),
            },
        );

        assert!(matches!(result, Err(NoteError::ReadOnly)));
    }

    #[test]
    fn set_tag_pinned_rejects_subtags() {
        let repo =
            MockNoteRepository::new().with_note(make_note("n1", "# Hello\n\n#work/project-alpha"));

        let result = NoteService::set_tag_pinned(
            &repo,
            SetTagPinnedInput {
                path: "work/project-alpha".to_string(),
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
            MockNoteRepository::new().with_note(make_note("n1", "# Hello\n\n#work/project-alpha"));

        NoteService::set_hide_subtag_notes(
            &repo,
            SetHideSubtagNotesInput {
                path: "work/project-alpha".to_string(),
                hide_subtag_notes: true,
            },
        )
        .unwrap();

        assert!(repo
            .hide_subtag_notes_tags
            .borrow()
            .contains("work/project-alpha"));
    }
}

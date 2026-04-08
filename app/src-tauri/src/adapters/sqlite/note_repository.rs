use std::collections::HashMap;
use std::path::{Path, PathBuf};

use rusqlite::{params, params_from_iter, types::Value, Connection, OptionalExtension};
use uuid::Uuid;

use crate::domain::common::text::{
    extract_tags, normalize_wikilink_title, preview_from_markdown, strip_tags_from_markdown,
};
use crate::domain::common::time::now_millis;
use crate::domain::notes::error::NoteError;
use crate::domain::notes::model::{
    ContextualTagNode, ContextualTagsInput, ContextualTagsPayload, ExportModeInput,
    ExportNotesInput, NoteBacklink, NoteFilterInput, NotePagePayload, NoteQueryInput,
    NoteSortDirection, NoteSortField, NoteSummary, ResolveWikilinkInput, SearchResult,
    WikiLinkResolutionInput,
};
use crate::domain::sync::conflict_store::merge_note_conflict_clocks;
use crate::domain::sync::vector_clock::{
    increment_vector_clock, parse_vector_clock, serialize_vector_clock,
};
use crate::ports::note_repository::{NoteRecord, NoteRepository};

const LAST_OPEN_NOTE_KEY: &str = "last_open_note_id";
const DEVICE_ID_KEY: &str = "sync_device_id";
const MAX_NOTES_PAGE_SIZE: usize = 100;
const SEARCH_RESULTS_LIMIT: usize = 20;

// ── Error helper ──────────────────────────────────────────────────────

#[allow(clippy::needless_pass_by_value)]
fn map_err(e: rusqlite::Error) -> NoteError {
    NoteError::Storage(e.to_string())
}

fn map_clock_err(error: String) -> NoteError {
    NoteError::Storage(error)
}

fn generate_device_id() -> String {
    Uuid::new_v4().hyphenated().to_string().to_uppercase()
}

// ── Search helpers ────────────────────────────────────────────────────

enum SearchMode {
    Match(String),
    Like(Vec<String>),
}

fn search_tokens_from_query(search_query: &str) -> Vec<String> {
    search_query
        .split_whitespace()
        .map(str::trim)
        .filter(|token| !token.is_empty())
        .map(ToOwned::to_owned)
        .collect()
}

fn search_mode_from_tokens(tokens: &[String]) -> Option<SearchMode> {
    if tokens.is_empty() {
        return None;
    }

    if tokens.iter().any(|token| token.chars().count() < 3) {
        return Some(SearchMode::Like(
            tokens
                .iter()
                .map(|token| format!("%{}%", escape_like_pattern(token)))
                .collect(),
        ));
    }

    Some(SearchMode::Match(
        tokens
            .iter()
            .map(|token| format!("\"{}\"", token.replace('"', "\"\"")))
            .collect::<Vec<_>>()
            .join(" AND "),
    ))
}

fn escape_like_pattern(token: &str) -> String {
    let mut escaped = String::with_capacity(token.len());

    for character in token.chars() {
        match character {
            '%' | '_' | '\\' => {
                escaped.push('\\');
                escaped.push(character);
            }
            _ => escaped.push(character),
        }
    }

    escaped
}

fn normalized_active_tag_path(tag: Option<&str>) -> Option<String> {
    let trimmed = tag?.trim();
    if trimmed.is_empty() {
        return None;
    }
    Some(trimmed.to_ascii_lowercase())
}

fn direct_tags_for_note(conn: &Connection, note_id: &str) -> Result<Vec<String>, NoteError> {
    let mut statement = conn
        .prepare(
            "SELECT t.path
             FROM note_tag_links l
             JOIN tags t ON t.id = l.tag_id
             WHERE l.note_id = ?1 AND l.is_direct = 1
             ORDER BY t.path ASC",
        )
        .map_err(map_err)?;

    let rows = statement
        .query_map(params![note_id], |row| row.get::<_, String>(0))
        .map_err(map_err)?;

    let mut tags = Vec::new();
    for row in rows {
        tags.push(row.map_err(map_err)?);
    }

    Ok(tags)
}

fn wikilink_resolutions_for_note(
    conn: &Connection,
    note_id: &str,
) -> Result<Vec<WikiLinkResolutionInput>, NoteError> {
    let mut statement = conn
        .prepare(
            "SELECT occurrence_id, location, title, target_note_id, is_explicit
             FROM note_wikilinks
             WHERE source_note_id = ?1
               AND target_note_id IS NOT NULL
               AND is_explicit = 1
             ORDER BY location ASC, occurrence_id ASC",
        )
        .map_err(map_err)?;

    let rows = statement
        .query_map(params![note_id], |row| {
            Ok(WikiLinkResolutionInput {
                occurrence_id: row.get(0)?,
                is_explicit: row.get::<_, i64>(4)? != 0,
                location: row.get::<_, i64>(1)? as usize,
                title: row.get(2)?,
                target_note_id: row.get(3)?,
            })
        })
        .map_err(map_err)?;

    let mut resolutions = Vec::new();
    for row in rows {
        resolutions.push(row.map_err(map_err)?);
    }

    Ok(resolutions)
}

fn active_wikilink_resolutions_for_note(
    conn: &Connection,
    note_id: &str,
) -> Result<Vec<WikiLinkResolutionInput>, NoteError> {
    let mut statement = conn
        .prepare(
            "SELECT l.occurrence_id, l.location, l.title, l.target_note_id, l.is_explicit
             FROM note_wikilinks l
             JOIN notes n ON n.id = l.target_note_id
             WHERE l.source_note_id = ?1
               AND l.target_note_id IS NOT NULL
               AND l.is_explicit = 1
               AND n.deleted_at IS NULL
             ORDER BY l.location ASC, l.occurrence_id ASC",
        )
        .map_err(map_err)?;

    let rows = statement
        .query_map(params![note_id], |row| {
            Ok(WikiLinkResolutionInput {
                occurrence_id: row.get(0)?,
                is_explicit: row.get::<_, i64>(4)? != 0,
                location: row.get::<_, i64>(1)? as usize,
                title: row.get(2)?,
                target_note_id: row.get(3)?,
            })
        })
        .map_err(map_err)?;

    let mut resolutions = Vec::new();
    for row in rows {
        resolutions.push(row.map_err(map_err)?);
    }

    Ok(resolutions)
}

fn preferred_active_note_id_for_normalized_title(
    conn: &Connection,
    normalized_title: &str,
) -> Result<Option<String>, NoteError> {
    let mut statement = conn
        .prepare(
            "SELECT id, title
             FROM notes
             WHERE deleted_at IS NULL
             ORDER BY COALESCE(edited_at, modified_at, created_at) DESC,
                      created_at DESC,
                      id DESC",
        )
        .map_err(map_err)?;

    let rows = statement
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(map_err)?;

    let mut matched_note_id: Option<String> = None;
    let mut match_count = 0usize;
    for row in rows {
        let (note_id, title) = row.map_err(map_err)?;
        if normalize_wikilink_title(&title).as_deref() != Some(normalized_title) {
            continue;
        }

        match_count += 1;
        if matched_note_id.is_none() {
            matched_note_id = Some(note_id);
        }
    }

    if match_count > 1 {
        log::warn!(
            "[wikilinks] fallback title resolution is ambiguous; choosing latest normalized_title={} match_count={}",
            normalized_title,
            match_count
        );
    }

    if matched_note_id.is_none() {
        log::warn!(
            "[wikilinks] fallback title resolution found no active note normalized_title={}",
            normalized_title
        );
    }

    Ok(matched_note_id)
}

fn sanitize_filename(title: &str) -> String {
    let sanitized: String = title
        .chars()
        .filter(|c| !c.is_control())
        .map(|c| {
            if matches!(c, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|') {
                '-'
            } else {
                c
            }
        })
        .collect();

    let trimmed = sanitized.trim().trim_matches('-').to_string();

    // Collapse consecutive dashes
    let mut result = String::with_capacity(trimmed.len());
    let mut prev_dash = false;
    for c in trimmed.chars() {
        if c == '-' {
            if !prev_dash {
                result.push(c);
            }
            prev_dash = true;
        } else {
            result.push(c);
            prev_dash = false;
        }
    }

    if result.is_empty() {
        "Untitled".to_string()
    } else if result.len() > 200 {
        result.chars().take(200).collect()
    } else {
        result
    }
}

fn export_markdown(markdown: &str, preserve_tags: bool) -> String {
    if preserve_tags {
        markdown.to_string()
    } else {
        strip_tags_from_markdown(markdown)
    }
}

fn matching_direct_export_tag<'a>(
    direct_tags: &'a [String],
    selected_path: &str,
) -> Option<&'a str> {
    direct_tags
        .iter()
        .filter(|tag| {
            tag.as_str() == selected_path
                || tag
                    .strip_prefix(selected_path)
                    .is_some_and(|suffix| suffix.starts_with('/'))
        })
        .max_by(|left, right| {
            left.matches('/')
                .count()
                .cmp(&right.matches('/').count())
                .then_with(|| right.cmp(left))
        })
        .map(String::as_str)
}

fn export_relative_directory_for_tag_scope(
    direct_tags: &[String],
    selected_path: &str,
) -> Option<PathBuf> {
    let selected_tag = matching_direct_export_tag(direct_tags, selected_path)?;
    if selected_tag == selected_path {
        return Some(PathBuf::new());
    }

    let relative = selected_tag
        .strip_prefix(selected_path)?
        .strip_prefix('/')?;
    let mut path = PathBuf::new();
    for segment in relative.split('/') {
        path.push(segment);
    }
    Some(path)
}

fn next_export_filename(
    used_names: &mut HashMap<String, usize>,
    directory: &Path,
    title: &str,
) -> String {
    let base = sanitize_filename(title);
    let key = format!("{}::{base}", directory.display());
    let entry = used_names.entry(key).or_insert(0);
    *entry += 1;

    if *entry == 1 {
        format!("{base}.md")
    } else {
        format!("{base} {entry}.md")
    }
}

// ── Search snippet helpers ────────────────────────────────────────────

fn searchable_markdown_text(markdown: &str) -> String {
    markdown
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty() && !line.starts_with("```"))
        .collect::<Vec<_>>()
        .join(" ")
}

fn search_snippet_for_summary(markdown: &str, search_tokens: &[String]) -> Option<String> {
    if search_tokens.is_empty() {
        return None;
    }
    search_snippet_from_markdown(markdown, search_tokens).filter(|snippet| !snippet.is_empty())
}

fn previous_word_boundary(text: &str, index: usize) -> usize {
    let mut boundary = 0;

    for (char_index, character) in text.char_indices() {
        if char_index >= index {
            break;
        }
        if character.is_whitespace() {
            boundary = char_index + character.len_utf8();
        }
    }

    boundary
}

fn next_word_boundary(text: &str, index: usize) -> usize {
    for (char_index, character) in text.char_indices() {
        if char_index < index {
            continue;
        }
        if character.is_whitespace() {
            return char_index;
        }
    }
    text.len()
}

fn trim_snippet_boundary(snippet: &str) -> String {
    snippet
        .trim_matches(|character: char| {
            character.is_whitespace()
                || matches!(
                    character,
                    '.' | ',' | ';' | ':' | '!' | '?' | ')' | '(' | '[' | ']' | '{' | '}'
                )
        })
        .to_string()
}

fn search_snippet_from_markdown(markdown: &str, search_tokens: &[String]) -> Option<String> {
    let text = searchable_markdown_text(markdown);
    if text.is_empty() {
        return None;
    }

    let normalized_text = text.to_ascii_lowercase();
    let first_match = search_tokens
        .iter()
        .filter_map(|token| {
            let normalized_token = token.trim().to_ascii_lowercase();
            if normalized_token.is_empty() {
                return None;
            }
            normalized_text
                .find(&normalized_token)
                .map(|index| (index, index + normalized_token.len()))
        })
        .min_by_key(|(index, _)| *index)?;

    let prefix_target = 52;
    let suffix_target = 84;
    let window_start = first_match.0.saturating_sub(prefix_target);
    let window_end = (first_match.1 + suffix_target).min(text.len());

    let start = previous_word_boundary(&text, window_start);
    let end = next_word_boundary(&text, window_end);

    let mut snippet = trim_snippet_boundary(&text[start..end]);
    if snippet.is_empty() {
        return None;
    }

    if start > 0 {
        snippet = format!("\u{2026}{snippet}");
    }
    if end < text.len() {
        snippet.push('\u{2026}');
    }

    Some(snippet)
}

// ── SQL clause builder ────────────────────────────────────────────────

fn append_note_view_clauses(
    clauses: &mut Vec<String>,
    values: &mut Vec<Value>,
    note_filter: NoteFilterInput,
) {
    match note_filter {
        NoteFilterInput::All => {
            clauses.push("n.archived_at IS NULL".to_string());
            clauses.push("n.deleted_at IS NULL".to_string());
        }
        NoteFilterInput::Today => {
            clauses.push("n.archived_at IS NULL".to_string());
            clauses.push("n.deleted_at IS NULL".to_string());
            clauses.push("n.edited_at >= ?".to_string());
            values.push(Value::from(now_millis() - 24 * 60 * 60 * 1000));
        }
        NoteFilterInput::Todo => {
            clauses.push("n.archived_at IS NULL".to_string());
            clauses.push("n.deleted_at IS NULL".to_string());
            clauses.push("n.markdown LIKE '%- [ ] %'".to_string());
        }
        NoteFilterInput::Pinned => {
            clauses.push("n.archived_at IS NULL".to_string());
            clauses.push("n.deleted_at IS NULL".to_string());
            clauses.push("n.pinned_at IS NOT NULL".to_string());
        }
        NoteFilterInput::Untagged => {
            clauses.push("n.archived_at IS NULL".to_string());
            clauses.push("n.deleted_at IS NULL".to_string());
            clauses.push(
                "NOT EXISTS (SELECT 1 FROM note_tag_links l WHERE l.note_id = n.id)".to_string(),
            );
        }
        NoteFilterInput::Archive => {
            clauses.push("n.archived_at IS NOT NULL".to_string());
            clauses.push("n.deleted_at IS NULL".to_string());
        }
        NoteFilterInput::Trash => {
            clauses.push("n.deleted_at IS NOT NULL".to_string());
        }
    }
}

#[derive(Debug, Clone)]
struct ContextualTagRow {
    path: String,
    depth: usize,
    pinned: bool,
    hide_subtag_notes: bool,
    direct_note_count: usize,
    inclusive_note_count: usize,
}

fn build_contextual_tag_tree(rows: Vec<ContextualTagRow>) -> Vec<ContextualTagNode> {
    let mut children_by_parent: HashMap<Option<String>, Vec<ContextualTagRow>> = HashMap::new();

    for row in rows {
        let parent = row
            .path
            .rsplit_once('/')
            .map(|(parent, _)| parent.to_string());
        children_by_parent.entry(parent).or_default().push(row);
    }

    fn build_children(
        parent: Option<String>,
        children_by_parent: &mut HashMap<Option<String>, Vec<ContextualTagRow>>,
    ) -> Vec<ContextualTagNode> {
        let mut rows = children_by_parent.remove(&parent).unwrap_or_default();
        rows.sort_by(|left, right| {
            right
                .pinned
                .cmp(&left.pinned)
                .then_with(|| left.path.cmp(&right.path))
        });

        rows.into_iter()
            .map(|row| {
                let path = row.path.clone();
                ContextualTagNode {
                    label: path.rsplit('/').next().unwrap_or(&path).to_string(),
                    path: path.clone(),
                    depth: row.depth,
                    pinned: row.pinned,
                    hide_subtag_notes: row.hide_subtag_notes,
                    direct_note_count: row.direct_note_count,
                    inclusive_note_count: row.inclusive_note_count,
                    children: build_children(Some(path), children_by_parent),
                }
            })
            .collect()
    }

    build_children(None, &mut children_by_parent)
}

// ── Row mappers ─────────────────────────────────────────────────────

fn row_to_note_record(row: &rusqlite::Row<'_>) -> rusqlite::Result<NoteRecord> {
    Ok(NoteRecord {
        id: row.get(0)?,
        title: row.get(1)?,
        markdown: row.get(2)?,
        modified_at: row.get(3)?,
        archived_at: row.get(4)?,
        deleted_at: row.get(5)?,
        pinned_at: row.get(6)?,
        readonly: row.get::<_, i64>(7)? != 0,
        nostr_d_tag: row.get(8)?,
        published_at: row.get(9)?,
        published_kind: row.get(10)?,
    })
}

fn row_to_note_summary(
    row: &rusqlite::Row<'_>,
    search_tokens: &[String],
) -> rusqlite::Result<NoteSummary> {
    let markdown: String = row.get(2)?;

    Ok(NoteSummary {
        id: row.get(0)?,
        title: row.get(1)?,
        edited_at: row.get(3)?,
        preview: preview_from_markdown(&markdown),
        search_snippet: search_snippet_for_summary(&markdown, search_tokens),
        archived_at: row.get(4)?,
        deleted_at: row.get(5)?,
        pinned_at: row.get(6)?,
        readonly: row.get::<_, i64>(7)? != 0,
        has_conflict: row.get::<_, i64>(8)? != 0,
    })
}

// ── SqliteNoteRepository ────────────────────────────────────────────

pub struct SqliteNoteRepository<'a> {
    conn: &'a Connection,
}

impl SqliteNoteRepository<'_> {
    fn current_device_id(&self) -> Result<String, NoteError> {
        let existing: Option<String> = self
            .conn
            .query_row(
                "SELECT value FROM app_settings WHERE key = ?1",
                params![DEVICE_ID_KEY],
                |row| row.get(0),
            )
            .optional()
            .map_err(map_err)?;

        if let Some(device_id) = existing {
            if !device_id.trim().is_empty() {
                return Ok(device_id);
            }
        }

        let device_id = generate_device_id();
        self.conn
            .execute(
                "INSERT INTO app_settings (key, value) VALUES (?1, ?2)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                params![DEVICE_ID_KEY, device_id],
            )
            .map_err(map_err)?;

        self.conn
            .query_row(
                "SELECT value FROM app_settings WHERE key = ?1",
                params![DEVICE_ID_KEY],
                |row| row.get(0),
            )
            .map_err(map_err)
    }

    pub(crate) fn next_vector_clock_json(
        &self,
        note_id: &str,
    ) -> Result<(String, String), NoteError> {
        let device_id = self.current_device_id()?;
        let existing: Option<String> = self
            .conn
            .query_row(
                "SELECT vector_clock FROM notes WHERE id = ?1",
                params![note_id],
                |row| row.get(0),
            )
            .optional()
            .map_err(map_err)?;

        let current_clock = existing
            .as_deref()
            .map(parse_vector_clock)
            .transpose()
            .map_err(map_clock_err)?
            .unwrap_or_default();
        let merged_clock = merge_note_conflict_clocks(self.conn, note_id, &current_clock)
            .map_err(|error| NoteError::Storage(error.to_string()))?;
        let next_clock =
            increment_vector_clock(&merged_clock, &device_id).map_err(map_clock_err)?;
        let next_clock_json = serialize_vector_clock(&next_clock).map_err(map_clock_err)?;
        Ok((device_id, next_clock_json))
    }

    pub(crate) fn active_wikilink_resolutions_for_note(
        &self,
        note_id: &str,
    ) -> Result<Vec<WikiLinkResolutionInput>, NoteError> {
        active_wikilink_resolutions_for_note(self.conn, note_id)
    }
}

impl<'a> SqliteNoteRepository<'a> {
    pub fn new(conn: &'a Connection) -> Self {
        Self { conn }
    }
}

impl NoteRepository for SqliteNoteRepository<'_> {
    // ── Note reads ────────────────────────────────────────────────────

    fn note_by_id(&self, note_id: &str) -> Result<Option<NoteRecord>, NoteError> {
        self.conn
            .query_row(
                "SELECT n.id, n.title, n.markdown, n.modified_at,
                        n.archived_at, n.deleted_at, n.pinned_at, n.readonly,
                        n.nostr_d_tag, n.published_at, n.published_kind
                 FROM notes n
                 WHERE n.id = ?1",
                params![note_id],
                row_to_note_record,
            )
            .optional()
            .map_err(map_err)
    }

    fn note_is_active(&self, note_id: &str) -> Result<bool, NoteError> {
        self.conn
            .query_row(
                "SELECT archived_at IS NULL AND deleted_at IS NULL FROM notes WHERE id = ?1",
                params![note_id],
                |row| row.get::<_, bool>(0),
            )
            .optional()
            .map_err(map_err)
            .map(|value| value.unwrap_or(false))
    }

    fn next_active_note_id(&self, excluding: Option<&str>) -> Result<Option<String>, NoteError> {
        self.conn
            .query_row(
                "SELECT id
                 FROM notes
                 WHERE archived_at IS NULL AND deleted_at IS NULL
                   AND (?1 IS NULL OR id != ?1)
                 ORDER BY pinned_at IS NULL ASC, pinned_at DESC, edited_at DESC, created_at DESC
                 LIMIT 1",
                params![excluding],
                |row| row.get(0),
            )
            .optional()
            .map_err(map_err)
    }

    fn note_markdown(&self, note_id: &str) -> Result<String, NoteError> {
        self.conn
            .query_row(
                "SELECT markdown FROM notes WHERE id = ?1",
                params![note_id],
                |row| row.get(0),
            )
            .optional()
            .map_err(map_err)?
            .ok_or(NoteError::NotFound)
    }

    fn note_markdown_and_readonly(&self, note_id: &str) -> Result<(String, bool), NoteError> {
        self.conn
            .query_row(
                "SELECT markdown, readonly FROM notes WHERE id = ?1",
                params![note_id],
                |row| Ok((row.get(0)?, row.get::<_, i64>(1)? != 0)),
            )
            .optional()
            .map_err(map_err)?
            .ok_or(NoteError::NotFound)
    }

    fn wikilink_resolutions_for_note(
        &self,
        note_id: &str,
    ) -> Result<Vec<WikiLinkResolutionInput>, NoteError> {
        wikilink_resolutions_for_note(self.conn, note_id)
    }

    fn tags_for_note(&self, note_id: &str) -> Result<Vec<String>, NoteError> {
        direct_tags_for_note(self.conn, note_id)
    }

    fn note_ids_with_direct_tag_subtree(&self, path: &str) -> Result<Vec<String>, NoteError> {
        let mut statement = self
            .conn
            .prepare(
                "SELECT l.note_id
                 FROM note_tag_links l
                 JOIN tags t ON t.id = l.tag_id
                 WHERE l.is_direct = 1 AND (t.path = ?1 OR t.path LIKE ?2)
                 ORDER BY l.note_id ASC",
            )
            .map_err(map_err)?;

        let rows = statement
            .query_map(params![path, format!("{path}/%")], |row| {
                row.get::<_, String>(0)
            })
            .map_err(map_err)?;

        let mut note_ids = Vec::new();
        for row in rows {
            note_ids.push(row.map_err(map_err)?);
        }

        Ok(note_ids)
    }

    fn archived_and_trashed_counts(&self) -> Result<(i64, i64), NoteError> {
        self.conn
            .query_row(
                "SELECT
                   SUM(CASE WHEN archived_at IS NOT NULL AND deleted_at IS NULL THEN 1 ELSE 0 END),
                   SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END)
                 FROM notes",
                [],
                |row| {
                    Ok((
                        row.get::<_, Option<i64>>(0)?.unwrap_or(0),
                        row.get::<_, Option<i64>>(1)?.unwrap_or(0),
                    ))
                },
            )
            .map_err(map_err)
    }

    // ── Note writes ───────────────────────────────────────────────────

    fn insert_note(
        &self,
        note_id: &str,
        title: &str,
        markdown: &str,
        now: i64,
    ) -> Result<(), NoteError> {
        let (device_id, vector_clock) = self.next_vector_clock_json(note_id)?;
        self.conn
            .execute(
                "INSERT INTO notes (
                   id, title, markdown, created_at, modified_at, edited_at,
                   last_edit_device_id, vector_clock, locally_modified
                 )
                 VALUES (?1, ?2, ?3, ?4, ?4, ?4, ?5, ?6, 1)",
                params![note_id, title, markdown, now, device_id, vector_clock],
            )
            .map_err(map_err)?;

        Ok(())
    }

    fn update_note_content(
        &self,
        note_id: &str,
        title: &str,
        markdown: &str,
        now: i64,
    ) -> Result<(), NoteError> {
        let (device_id, vector_clock) = self.next_vector_clock_json(note_id)?;
        let updated = self
            .conn
            .execute(
                "UPDATE notes
                 SET title = ?1,
                     markdown = ?2,
                     modified_at = ?3,
                     edited_at = ?3,
                     last_edit_device_id = ?4,
                     vector_clock = ?5,
                     locally_modified = 1
                 WHERE id = ?6",
                params![title, markdown, now, device_id, vector_clock, note_id],
            )
            .map_err(map_err)?;

        if updated == 0 {
            return Err(NoteError::NotFound);
        }

        Ok(())
    }

    fn update_note_title_only(
        &self,
        note_id: &str,
        title: &str,
        markdown: &str,
    ) -> Result<(), NoteError> {
        let updated = self
            .conn
            .execute(
                "UPDATE notes SET title = ?1, markdown = ?2 WHERE id = ?3",
                params![title, markdown, note_id],
            )
            .map_err(map_err)?;

        if updated == 0 {
            return Err(NoteError::NotFound);
        }

        Ok(())
    }

    fn update_note_markdown_preserving_modified_at(
        &self,
        note_id: &str,
        title: &str,
        markdown: &str,
    ) -> Result<(), NoteError> {
        let (device_id, vector_clock) = self.next_vector_clock_json(note_id)?;
        let updated = self
            .conn
            .execute(
                "UPDATE notes
                 SET title = ?1,
                     markdown = ?2,
                     last_edit_device_id = ?3,
                     vector_clock = ?4,
                     locally_modified = 1
                 WHERE id = ?5",
                params![title, markdown, device_id, vector_clock, note_id],
            )
            .map_err(map_err)?;

        if updated == 0 {
            return Err(NoteError::NotFound);
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
        let (device_id, vector_clock) = self.next_vector_clock_json(note_id)?;
        let updated = self
            .conn
            .execute(
                "UPDATE notes
                 SET title = ?1,
                     markdown = ?2,
                     modified_at = ?3,
                     last_edit_device_id = ?4,
                     vector_clock = ?5,
                     locally_modified = 1
                 WHERE id = ?6",
                params![title, markdown, now, device_id, vector_clock, note_id],
            )
            .map_err(map_err)?;

        if updated == 0 {
            return Err(NoteError::NotFound);
        }

        Ok(())
    }

    fn set_readonly(&self, note_id: &str, readonly: bool, now: i64) -> Result<usize, NoteError> {
        let (device_id, vector_clock) = self.next_vector_clock_json(note_id)?;
        self.conn
            .execute(
                "UPDATE notes
                 SET readonly = ?1,
                     modified_at = ?2,
                     last_edit_device_id = ?3,
                     vector_clock = ?4,
                     locally_modified = 1
                 WHERE id = ?5",
                params![i32::from(readonly), now, device_id, vector_clock, note_id],
            )
            .map_err(map_err)
    }

    fn archive_note(&self, note_id: &str, now: i64) -> Result<usize, NoteError> {
        let (device_id, vector_clock) = self.next_vector_clock_json(note_id)?;
        self.conn
            .execute(
                "UPDATE notes
                 SET archived_at = ?1,
                     modified_at = ?1,
                     last_edit_device_id = ?2,
                     vector_clock = ?3,
                     locally_modified = 1
                 WHERE id = ?4 AND archived_at IS NULL",
                params![now, device_id, vector_clock, note_id],
            )
            .map_err(map_err)
    }

    fn restore_note(&self, note_id: &str, now: i64) -> Result<usize, NoteError> {
        let (device_id, vector_clock) = self.next_vector_clock_json(note_id)?;
        self.conn
            .execute(
                "UPDATE notes
                 SET archived_at = NULL,
                     modified_at = ?1,
                     last_edit_device_id = ?2,
                     vector_clock = ?3,
                     locally_modified = 1
                 WHERE id = ?4 AND archived_at IS NOT NULL",
                params![now, device_id, vector_clock, note_id],
            )
            .map_err(map_err)
    }

    fn trash_note(&self, note_id: &str, now: i64) -> Result<usize, NoteError> {
        let (device_id, vector_clock) = self.next_vector_clock_json(note_id)?;
        self.conn
            .execute(
                "UPDATE notes
                 SET deleted_at = ?1,
                     modified_at = ?1,
                     last_edit_device_id = ?2,
                     vector_clock = ?3,
                     locally_modified = 1
                 WHERE id = ?4 AND deleted_at IS NULL",
                params![now, device_id, vector_clock, note_id],
            )
            .map_err(map_err)
    }

    fn restore_from_trash(&self, note_id: &str, now: i64) -> Result<usize, NoteError> {
        let (device_id, vector_clock) = self.next_vector_clock_json(note_id)?;
        self.conn
            .execute(
                "UPDATE notes
                 SET deleted_at = NULL,
                     modified_at = ?1,
                     last_edit_device_id = ?2,
                     vector_clock = ?3,
                     locally_modified = 1
                 WHERE id = ?4 AND deleted_at IS NOT NULL",
                params![now, device_id, vector_clock, note_id],
            )
            .map_err(map_err)
    }

    fn pin_note(&self, note_id: &str, now: i64) -> Result<usize, NoteError> {
        let (device_id, vector_clock) = self.next_vector_clock_json(note_id)?;
        self.conn
            .execute(
                "UPDATE notes
                 SET pinned_at = ?1,
                     modified_at = ?1,
                     last_edit_device_id = ?2,
                     vector_clock = ?3,
                     locally_modified = 1
                 WHERE id = ?4",
                params![now, device_id, vector_clock, note_id],
            )
            .map_err(map_err)
    }

    fn unpin_note(&self, note_id: &str, now: i64) -> Result<usize, NoteError> {
        let (device_id, vector_clock) = self.next_vector_clock_json(note_id)?;
        self.conn
            .execute(
                "UPDATE notes
                 SET pinned_at = NULL,
                     modified_at = ?1,
                     last_edit_device_id = ?2,
                     vector_clock = ?3,
                     locally_modified = 1
                 WHERE id = ?4",
                params![now, device_id, vector_clock, note_id],
            )
            .map_err(map_err)
    }

    fn trashed_note_ids(&self) -> Result<Vec<String>, NoteError> {
        let mut stmt = self
            .conn
            .prepare("SELECT id FROM notes WHERE deleted_at IS NOT NULL")
            .map_err(map_err)?;
        let rows = stmt.query_map([], |row| row.get(0)).map_err(map_err)?;
        let mut ids = Vec::new();
        for row in rows {
            ids.push(row.map_err(map_err)?);
        }
        Ok(ids)
    }

    // ── FTS / tags ────────────────────────────────────────────────────

    fn upsert_search_document(
        &self,
        note_id: &str,
        title: &str,
        markdown: &str,
    ) -> Result<(), NoteError> {
        self.conn
            .execute("DELETE FROM notes_fts WHERE note_id = ?1", params![note_id])
            .map_err(map_err)?;
        self.conn
            .execute(
                "INSERT INTO notes_fts (note_id, title, markdown) VALUES (?1, ?2, ?3)",
                params![note_id, title, markdown],
            )
            .map_err(map_err)?;
        Ok(())
    }

    fn replace_tags(&self, note_id: &str, markdown: &str) -> Result<(), NoteError> {
        let next_tags = extract_tags(markdown);
        let current_tags = direct_tags_for_note(self.conn, note_id)?;

        if current_tags == next_tags {
            return Ok(());
        }

        crate::adapters::sqlite::tag_index::rebuild_note_tag_index(self.conn, note_id, markdown)
            .map_err(map_err)
    }

    fn replace_wikilinks(
        &self,
        note_id: &str,
        markdown: &str,
        resolutions: &[WikiLinkResolutionInput],
    ) -> Result<(), NoteError> {
        crate::adapters::sqlite::wikilink_index::rebuild_note_wikilink_index(
            self.conn,
            note_id,
            markdown,
            resolutions,
        )
        .map_err(map_err)
    }

    fn refresh_wikilink_targets(&self, titles: &[String]) -> Result<(), NoteError> {
        crate::adapters::sqlite::wikilink_index::refresh_wikilink_targets(self.conn, titles)
            .map_err(map_err)
    }

    fn tag_is_pinned(&self, path: &str) -> Result<bool, NoteError> {
        self.conn
            .query_row(
                "SELECT pinned FROM tags WHERE path = ?1",
                params![path],
                |row| Ok(row.get::<_, i64>(0)? != 0),
            )
            .optional()
            .map_err(map_err)
            .map(|value| value.unwrap_or(false))
    }

    fn set_tag_pinned(&self, path: &str, pinned: bool) -> Result<usize, NoteError> {
        self.conn
            .execute(
                "UPDATE tags SET pinned = ?1, updated_at = ?2 WHERE path = ?3",
                params![i32::from(pinned), now_millis(), path],
            )
            .map_err(map_err)
    }

    fn set_tag_hide_subtag_notes(&self, path: &str, hide: bool) -> Result<usize, NoteError> {
        self.conn
            .execute(
                "UPDATE tags SET hide_subtag_notes = ?1, updated_at = ?2 WHERE path = ?3",
                params![i32::from(hide), now_millis(), path],
            )
            .map_err(map_err)
    }

    // ── Queries ───────────────────────────────────────────────────────

    fn query_note_page(&self, input: &NoteQueryInput) -> Result<NotePagePayload, NoteError> {
        let limit = input.limit.clamp(1, MAX_NOTES_PAGE_SIZE);
        let search_tokens = search_tokens_from_query(&input.search_query);
        let search_mode = search_mode_from_tokens(&search_tokens);
        let active_tag_path = normalized_active_tag_path(input.active_tag_path.as_deref());

        let mut sql = String::from(
            "SELECT n.id, n.title, n.markdown, n.edited_at, n.archived_at, n.deleted_at, n.pinned_at, n.readonly,
                    EXISTS (
                      SELECT 1
                      FROM note_conflicts nc
                      WHERE nc.note_id = n.id
                    ) AS has_conflict
             FROM notes n",
        );
        let mut clauses = Vec::new();
        let mut values = Vec::new();

        if let Some(search_mode) = &search_mode {
            match search_mode {
                SearchMode::Match(search_query) => {
                    sql = String::from(
                        "SELECT n.id, n.title, n.markdown, n.modified_at, n.archived_at, n.deleted_at, n.pinned_at, n.readonly,
                                EXISTS (
                                  SELECT 1
                                  FROM note_conflicts nc
                                  WHERE nc.note_id = n.id
                                ) AS has_conflict
                         FROM notes n
                         JOIN notes_fts ON notes_fts.note_id = n.id",
                    );
                    clauses.push("notes_fts MATCH ?".to_string());
                    values.push(Value::from(search_query.clone()));
                }
                SearchMode::Like(patterns) => {
                    sql.push_str(" JOIN notes_fts ON notes_fts.note_id = n.id");
                    for pattern in patterns {
                        clauses.push(
                            "(notes_fts.title LIKE ? ESCAPE '\\' OR notes_fts.markdown LIKE ? ESCAPE '\\')"
                                .to_string(),
                        );
                        values.push(Value::from(pattern.clone()));
                        values.push(Value::from(pattern.clone()));
                    }
                }
            }
        }

        append_note_view_clauses(&mut clauses, &mut values, input.note_filter);

        if let Some(tag) = &active_tag_path {
            clauses.push(
                "EXISTS (
                   SELECT 1
                   FROM note_tag_links l_filter
                   JOIN tags t_filter ON t_filter.id = l_filter.tag_id
                   JOIN tags t_selected ON t_selected.path = ?
                   WHERE l_filter.note_id = n.id
                     AND t_filter.path = t_selected.path
                     AND (t_selected.hide_subtag_notes = 0 OR l_filter.is_direct = 1)
                 )"
                .to_string(),
            );
            values.push(Value::from(tag.clone()));
        }

        let where_clause = if clauses.is_empty() {
            String::new()
        } else {
            format!(" WHERE {}", clauses.join(" AND "))
        };

        // Only run the count query on the first page -- the frontend reads
        // totalCount from pages[0] and ignores it on subsequent pages.
        let total_count = if input.offset == 0 {
            let count_sql = if search_mode.is_some() {
                format!(
                    "SELECT COUNT(*) FROM notes n JOIN notes_fts ON notes_fts.note_id = n.id{where_clause}"
                )
            } else {
                format!("SELECT COUNT(*) FROM notes n{where_clause}")
            };
            self.conn
                .query_row(&count_sql, params_from_iter(values.iter()), |row| {
                    row.get::<_, i64>(0)
                })
                .map_err(map_err)? as usize
        } else {
            0
        };

        sql.push_str(&where_clause);

        let sort_column = match input.sort_field {
            NoteSortField::ModifiedAt => "n.edited_at",
            NoteSortField::CreatedAt => "n.created_at",
            NoteSortField::Title => "n.title",
        };
        let sort_dir = match (&input.sort_field, &input.sort_direction) {
            (NoteSortField::Title, NoteSortDirection::Newest) => "ASC",
            (NoteSortField::Title, NoteSortDirection::Oldest) => "DESC",
            (_, NoteSortDirection::Newest) => "DESC",
            (_, NoteSortDirection::Oldest) => "ASC",
        };
        sql.push_str(&format!(
            " ORDER BY n.pinned_at IS NULL ASC, n.pinned_at DESC, {sort_column} {sort_dir}, n.created_at DESC
              LIMIT ? OFFSET ?",
        ));
        values.push(Value::from((limit + 1) as i64));
        values.push(Value::from(input.offset as i64));

        let mut statement = self.conn.prepare(&sql).map_err(map_err)?;
        let rows = statement
            .query_map(params_from_iter(values.iter()), |row| {
                row_to_note_summary(row, &search_tokens)
            })
            .map_err(map_err)?;

        let mut notes = Vec::new();
        for row in rows {
            notes.push(row.map_err(map_err)?);
        }

        let has_more = notes.len() > limit;
        if has_more {
            notes.truncate(limit);
        }

        Ok(NotePagePayload {
            next_offset: has_more.then_some(input.offset + limit),
            has_more,
            notes,
            total_count,
        })
    }

    fn search_notes(&self, query: &str) -> Result<Vec<SearchResult>, NoteError> {
        let search_tokens = search_tokens_from_query(query);
        let search_mode = match search_mode_from_tokens(&search_tokens) {
            Some(mode) => mode,
            None => return Ok(Vec::new()),
        };

        let (sql, values): (String, Vec<Value>) = match &search_mode {
            SearchMode::Match(search_query) => (
                "SELECT n.id, n.title, n.markdown, n.archived_at
                 FROM notes n
                 JOIN notes_fts ON notes_fts.note_id = n.id
                 WHERE notes_fts MATCH ?
                 ORDER BY n.pinned_at IS NULL ASC, n.edited_at DESC
                 LIMIT ?"
                    .to_string(),
                vec![
                    Value::from(search_query.clone()),
                    Value::from((SEARCH_RESULTS_LIMIT + 1) as i64),
                ],
            ),
            SearchMode::Like(patterns) => {
                let mut sql = String::from(
                    "SELECT n.id, n.title, n.markdown, n.archived_at
                     FROM notes n
                     JOIN notes_fts ON notes_fts.note_id = n.id
                     WHERE ",
                );
                let mut vals = Vec::new();
                let mut like_clauses = Vec::new();
                for pattern in patterns {
                    like_clauses.push(
                        "(notes_fts.title LIKE ? ESCAPE '\\' OR notes_fts.markdown LIKE ? ESCAPE '\\')"
                            .to_string(),
                    );
                    vals.push(Value::from(pattern.clone()));
                    vals.push(Value::from(pattern.clone()));
                }
                sql.push_str(&like_clauses.join(" AND "));
                sql.push_str(" ORDER BY n.pinned_at IS NULL ASC, n.edited_at DESC LIMIT ?");
                vals.push(Value::from((SEARCH_RESULTS_LIMIT + 1) as i64));
                (sql, vals)
            }
        };

        let mut statement = self.conn.prepare(&sql).map_err(map_err)?;
        let rows = statement
            .query_map(params_from_iter(values.iter()), |row| {
                let markdown: String = row.get(2)?;

                Ok(SearchResult {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    preview: search_snippet_for_summary(&markdown, &search_tokens)
                        .unwrap_or_else(|| preview_from_markdown(&markdown)),
                    archived_at: row.get(3)?,
                })
            })
            .map_err(map_err)?;

        let mut results = Vec::new();
        for row in rows {
            results.push(row.map_err(map_err)?);
            if results.len() >= SEARCH_RESULTS_LIMIT {
                break;
            }
        }

        Ok(results)
    }

    fn search_tags(&self, query: &str) -> Result<Vec<String>, NoteError> {
        let escaped = escape_like_pattern(&query.to_ascii_lowercase());
        let contains_pattern = format!("%{escaped}%");
        let prefix_pattern = format!("{escaped}%");

        // Rank: prefix matches first, then contains matches.
        // Within each group, sort by frequency (most-used tags first).
        let mut statement = self
            .conn
            .prepare(
                "SELECT t.path,
                        SUM(CASE WHEN l.is_direct = 1 THEN 1 ELSE 0 END) AS freq,
                        CASE WHEN t.path LIKE ?2 ESCAPE '\\' THEN 0 ELSE 1 END AS rank
                 FROM tags t
                 JOIN note_tag_links l ON l.tag_id = t.id
                 WHERE t.path LIKE ?1 ESCAPE '\\'
                 GROUP BY t.id, t.path
                 ORDER BY rank ASC, freq DESC, t.path ASC
                 LIMIT 20",
            )
            .map_err(map_err)?;

        let rows = statement
            .query_map(params![contains_pattern, prefix_pattern], |row| {
                row.get::<_, String>(0)
            })
            .map_err(map_err)?;

        let mut tags = Vec::new();
        for row in rows {
            tags.push(row.map_err(map_err)?);
        }

        Ok(tags)
    }

    fn backlinks_for_note(&self, note_id: &str) -> Result<Vec<NoteBacklink>, NoteError> {
        let mut statement = self
            .conn
            .prepare(
                "SELECT l.source_note_id, n.title, n.markdown, l.title, l.location
                 FROM note_wikilinks l
                 JOIN notes n ON n.id = l.source_note_id
                 WHERE l.target_note_id = ?1
                   AND n.deleted_at IS NULL
                 ORDER BY n.pinned_at IS NULL ASC, n.pinned_at DESC, n.edited_at DESC, l.location ASC",
            )
            .map_err(map_err)?;

        let rows = statement
            .query_map(params![note_id], |row| {
                let markdown: String = row.get(2)?;
                Ok(NoteBacklink {
                    source_note_id: row.get(0)?,
                    source_title: row.get(1)?,
                    source_preview: preview_from_markdown(&markdown),
                    title: row.get(3)?,
                    location: row.get::<_, i64>(4)? as usize,
                })
            })
            .map_err(map_err)?;

        let mut backlinks = Vec::new();
        for row in rows {
            backlinks.push(row.map_err(map_err)?);
        }

        Ok(backlinks)
    }

    fn resolve_wikilink(&self, input: &ResolveWikilinkInput) -> Result<Option<String>, NoteError> {
        log::info!(
            "[wikilinks] resolving source_note_id={} location={} title={}",
            input.source_note_id,
            input.location,
            input.title
        );

        let indexed_target: Option<String> = self
            .conn
            .query_row(
                "SELECT l.target_note_id
                 FROM note_wikilinks l
                 JOIN notes n ON n.id = l.target_note_id
                 WHERE l.source_note_id = ?1
                   AND l.location = ?2
                   AND l.title = ?3
                   AND n.deleted_at IS NULL
                 LIMIT 1",
                params![input.source_note_id, input.location as i64, input.title],
                |row| row.get(0),
            )
            .optional()
            .map_err(map_err)?;
        if let Some(target_note_id) = indexed_target {
            log::info!(
                "[wikilinks] resolved via indexed occurrence source_note_id={} location={} title={} target_note_id={}",
                input.source_note_id,
                input.location,
                input.title,
                target_note_id
            );
            return Ok(Some(target_note_id));
        }

        log::info!(
            "[wikilinks] indexed occurrence did not resolve source_note_id={} location={} title={}",
            input.source_note_id,
            input.location,
            input.title
        );

        let exact_row: Option<(Option<String>, bool)> = self
            .conn
            .query_row(
                "SELECT target_note_id, is_explicit
                 FROM note_wikilinks
                 WHERE source_note_id = ?1
                   AND location = ?2
                   AND title = ?3
                 LIMIT 1",
                params![input.source_note_id, input.location as i64, input.title],
                |row| Ok((row.get(0)?, row.get::<_, i64>(1)? != 0)),
            )
            .optional()
            .map_err(map_err)?;

        if let Some((target_note_id, is_explicit)) = exact_row {
            if is_explicit {
                log::warn!(
                    "[wikilinks] explicit wikilink is unresolved source_note_id={} location={} title={} stored_target_note_id={:?}",
                    input.source_note_id,
                    input.location,
                    input.title,
                    target_note_id
                );
                return Ok(None);
            }
        }

        if let Ok(mut statement) = self.conn.prepare(
            "SELECT occurrence_id, location, title, target_note_id, is_explicit
             FROM note_wikilinks
             WHERE source_note_id = ?1
             ORDER BY location ASC",
        ) {
            match statement.query_map(params![input.source_note_id.clone()], |row| {
                Ok((
                    row.get::<_, Option<String>>(0)?,
                    row.get::<_, i64>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, Option<String>>(3)?,
                    row.get::<_, i64>(4)? != 0,
                ))
            }) {
                Ok(rows) => {
                    let candidates = rows
                        .filter_map(Result::ok)
                        .map(|(occurrence_id, location, title, target_note_id, is_explicit)| {
                            format!(
                                "{{occurrence_id={occurrence_id:?}, location={location}, title={title:?}, target_note_id={target_note_id:?}, is_explicit={is_explicit}}}"
                            )
                        })
                        .collect::<Vec<_>>();
                    log::warn!(
                        "[wikilinks] stored rows for source_note_id={} rows={}",
                        input.source_note_id,
                        candidates.join(", ")
                    );
                }
                Err(error) => {
                    log::warn!(
                        "[wikilinks] failed to inspect stored rows source_note_id={} error={}",
                        input.source_note_id,
                        error
                    );
                }
            }
        }

        let Some(normalized_title) = normalize_wikilink_title(&input.title) else {
            log::warn!(
                "[wikilinks] title could not be normalized source_note_id={} location={} title={}",
                input.source_note_id,
                input.location,
                input.title
            );
            return Ok(None);
        };

        let fallback_target =
            preferred_active_note_id_for_normalized_title(self.conn, &normalized_title)?;

        if let Some(target_note_id) = &fallback_target {
            log::info!(
                "[wikilinks] resolved via fallback title source_note_id={} location={} normalized_title={} target_note_id={}",
                input.source_note_id,
                input.location,
                normalized_title,
                target_note_id
            );
        } else {
            log::warn!(
                "[wikilinks] failed to resolve source_note_id={} location={} normalized_title={}",
                input.source_note_id,
                input.location,
                normalized_title
            );
        }

        Ok(fallback_target)
    }

    fn query_contextual_tags(
        &self,
        input: &ContextualTagsInput,
    ) -> Result<ContextualTagsPayload, NoteError> {
        let mut sql = String::from(
            "SELECT t.path,
                    t.depth,
                    t.pinned,
                    t.hide_subtag_notes,
                    SUM(CASE WHEN l.is_direct = 1 THEN 1 ELSE 0 END) AS direct_note_count,
                    COUNT(*) AS inclusive_note_count
             FROM notes n
             JOIN note_tag_links l ON l.note_id = n.id
             JOIN tags t ON t.id = l.tag_id",
        );
        let mut clauses = Vec::new();
        let mut values = Vec::new();

        append_note_view_clauses(&mut clauses, &mut values, input.note_filter);

        if !clauses.is_empty() {
            sql.push_str(" WHERE ");
            sql.push_str(&clauses.join(" AND "));
        }

        sql.push_str(
            " GROUP BY t.id, t.path, t.depth, t.pinned, t.hide_subtag_notes
              ORDER BY t.pinned DESC, t.path ASC",
        );

        let mut statement = self.conn.prepare(&sql).map_err(map_err)?;
        let rows = statement
            .query_map(params_from_iter(values.iter()), |row| {
                Ok(ContextualTagRow {
                    path: row.get(0)?,
                    depth: row.get::<_, i64>(1)? as usize,
                    pinned: row.get::<_, i64>(2)? != 0,
                    hide_subtag_notes: row.get::<_, i64>(3)? != 0,
                    direct_note_count: row.get::<_, i64>(4)? as usize,
                    inclusive_note_count: row.get::<_, i64>(5)? as usize,
                })
            })
            .map_err(map_err)?;

        let mut tags = Vec::new();
        for row in rows {
            tags.push(row.map_err(map_err)?);
        }

        Ok(ContextualTagsPayload {
            roots: build_contextual_tag_tree(tags),
        })
    }

    fn todo_count(&self) -> Result<i64, NoteError> {
        self.conn
            .query_row(
                "SELECT COUNT(*) FROM notes WHERE archived_at IS NULL AND deleted_at IS NULL AND markdown LIKE '%- [ ] %'",
                [],
                |row| row.get(0),
            )
            .map_err(map_err)
    }

    fn export_notes(&self, input: &ExportNotesInput) -> Result<usize, NoteError> {
        let export_dir = PathBuf::from(&input.export_dir);
        std::fs::create_dir_all(&export_dir)
            .map_err(|e| NoteError::Storage(format!("Failed to create export directory: {e}")))?;

        let mut used_names: HashMap<String, usize> = HashMap::new();
        let mut count = 0;

        match input.export_mode {
            ExportModeInput::NoteFilter => {
                let note_filter = input.note_filter.ok_or(NoteError::InvalidExportInput)?;
                let mut sql = String::from("SELECT n.title, n.markdown FROM notes n WHERE ");
                let mut clauses = Vec::new();
                let mut values = Vec::new();

                append_note_view_clauses(&mut clauses, &mut values, note_filter);

                sql.push_str(&clauses.join(" AND "));
                sql.push_str(" ORDER BY n.edited_at DESC");

                let mut statement = self.conn.prepare(&sql).map_err(map_err)?;
                let rows = statement
                    .query_map(params_from_iter(values.iter()), |row| {
                        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
                    })
                    .map_err(map_err)?;

                for row in rows {
                    let (title, markdown) = row.map_err(map_err)?;
                    let filename = next_export_filename(&mut used_names, &export_dir, &title);
                    let content = export_markdown(&markdown, input.preserve_tags);

                    std::fs::write(export_dir.join(&filename), content).map_err(|e| {
                        NoteError::Storage(format!("Failed to write {filename}: {e}"))
                    })?;
                    count += 1;
                }
            }
            ExportModeInput::Tag => {
                let selected_path = input
                    .tag_path
                    .as_deref()
                    .ok_or(NoteError::InvalidExportInput)?;
                let mut statement = self
                    .conn
                    .prepare(
                        "SELECT n.id, n.title, n.markdown
                         FROM notes n
                         WHERE n.archived_at IS NULL
                           AND n.deleted_at IS NULL
                           AND EXISTS (
                             SELECT 1
                             FROM note_tag_links l
                             JOIN tags t ON t.id = l.tag_id
                             WHERE l.note_id = n.id
                               AND l.is_direct = 1
                               AND (t.path = ?1 OR t.path LIKE ?2 ESCAPE '\\')
                           )
                         ORDER BY n.edited_at DESC",
                    )
                    .map_err(map_err)?;

                let rows = statement
                    .query_map(
                        params![selected_path, format!("{selected_path}/%")],
                        |row| {
                            Ok((
                                row.get::<_, String>(0)?,
                                row.get::<_, String>(1)?,
                                row.get::<_, String>(2)?,
                            ))
                        },
                    )
                    .map_err(map_err)?;

                for row in rows {
                    let (note_id, title, markdown) = row.map_err(map_err)?;
                    let direct_tags = direct_tags_for_note(self.conn, &note_id)?;
                    let relative_directory =
                        export_relative_directory_for_tag_scope(&direct_tags, selected_path)
                            .ok_or(NoteError::InvalidExportInput)?;
                    let target_directory = export_dir.join(relative_directory);
                    std::fs::create_dir_all(&target_directory).map_err(|e| {
                        NoteError::Storage(format!("Failed to create export directory: {e}"))
                    })?;

                    let filename = next_export_filename(&mut used_names, &target_directory, &title);
                    let content = export_markdown(&markdown, input.preserve_tags);

                    std::fs::write(target_directory.join(&filename), content).map_err(|e| {
                        NoteError::Storage(format!("Failed to write {filename}: {e}"))
                    })?;
                    count += 1;
                }
            }
        }

        Ok(count)
    }

    // ── App settings ──────────────────────────────────────────────────

    fn last_open_note_id(&self) -> Result<Option<String>, NoteError> {
        self.conn
            .query_row(
                "SELECT value FROM app_settings WHERE key = ?1",
                params![LAST_OPEN_NOTE_KEY],
                |row| row.get(0),
            )
            .optional()
            .map_err(map_err)
    }

    fn set_last_open_note_id(&self, note_id: Option<&str>) -> Result<(), NoteError> {
        if let Some(note_id) = note_id {
            self.conn
                .execute(
                    "INSERT INTO app_settings (key, value)
                     VALUES (?1, ?2)
                     ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                    params![LAST_OPEN_NOTE_KEY, note_id],
                )
                .map_err(map_err)?;
        } else {
            self.conn
                .execute(
                    "DELETE FROM app_settings WHERE key = ?1",
                    params![LAST_OPEN_NOTE_KEY],
                )
                .map_err(map_err)?;
        }
        Ok(())
    }

    // ── Nostr identity ────────────────────────────────────────────────

    fn current_npub(&self) -> Result<String, NoteError> {
        self.conn
            .query_row("SELECT npub FROM nostr_identity LIMIT 1", [], |row| {
                row.get::<_, String>(0)
            })
            .optional()
            .map_err(map_err)?
            .ok_or_else(|| NoteError::Storage("No Nostr identity configured.".to_string()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::adapters::sqlite::migrations::account_migrations;
    use crate::domain::sync::vector_clock::parse_vector_clock;
    use std::collections::BTreeMap;

    fn setup_export_repo() -> (Connection, PathBuf) {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "
            CREATE TABLE notes (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                markdown TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                modified_at INTEGER NOT NULL,
                edited_at INTEGER NOT NULL,
                archived_at INTEGER,
                deleted_at INTEGER,
                pinned_at INTEGER,
                readonly INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE tags (
                id INTEGER PRIMARY KEY,
                path TEXT NOT NULL UNIQUE,
                depth INTEGER NOT NULL,
                pinned INTEGER NOT NULL DEFAULT 0,
                hide_subtag_notes INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE note_tag_links (
                note_id TEXT NOT NULL,
                tag_id INTEGER NOT NULL,
                is_direct INTEGER NOT NULL
            );
            ",
        )
        .unwrap();

        let export_dir = std::env::temp_dir().join(format!(
            "comet-export-test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&export_dir).unwrap();

        (conn, export_dir)
    }

    fn insert_tag(conn: &Connection, id: i64, path: &str) {
        conn.execute(
            "INSERT INTO tags (id, path, depth) VALUES (?1, ?2, ?3)",
            params![id, path, path.matches('/').count() as i64],
        )
        .unwrap();
    }

    fn insert_note(conn: &Connection, id: &str, title: &str, markdown: &str, edited_at: i64) {
        conn.execute(
            "INSERT INTO notes (id, title, markdown, created_at, modified_at, edited_at)
             VALUES (?1, ?2, ?3, 1, 1, ?4)",
            params![id, title, markdown, edited_at],
        )
        .unwrap();
    }

    #[test]
    fn export_tag_scope_places_notes_in_deepest_matching_direct_folder() {
        let (conn, export_dir) = setup_export_repo();
        insert_tag(&conn, 1, "work");
        insert_tag(&conn, 2, "work/project");
        insert_tag(&conn, 3, "work/project/mobile");

        insert_note(&conn, "n1", "Parent", "# Parent\n\n#work", 10);
        insert_note(&conn, "n2", "Child", "# Child\n\n#work/project", 20);
        insert_note(
            &conn,
            "n3",
            "Deep",
            "# Deep\n\n#work #work/project/mobile",
            30,
        );

        conn.execute(
            "INSERT INTO note_tag_links (note_id, tag_id, is_direct) VALUES
             ('n1', 1, 1),
             ('n2', 2, 1),
             ('n3', 1, 1),
             ('n3', 3, 1)",
            [],
        )
        .unwrap();

        let repo = SqliteNoteRepository::new(&conn);
        let count = repo
            .export_notes(&ExportNotesInput {
                export_mode: ExportModeInput::Tag,
                note_filter: None,
                tag_path: Some("work".to_string()),
                preserve_tags: true,
                export_dir: export_dir.to_string_lossy().into_owned(),
            })
            .unwrap();

        assert_eq!(count, 3);
        assert!(export_dir.join("Parent.md").exists());
        assert!(export_dir.join("project").join("Child.md").exists());
        assert!(export_dir
            .join("project")
            .join("mobile")
            .join("Deep.md")
            .exists());

        let _ = std::fs::remove_dir_all(export_dir);
    }

    #[test]
    fn export_notes_can_strip_inline_tags() {
        let (conn, export_dir) = setup_export_repo();
        insert_note(
            &conn,
            "n1",
            "Tagged",
            "# Tagged\n\n#work #project-alpha",
            10,
        );

        let repo = SqliteNoteRepository::new(&conn);
        let count = repo
            .export_notes(&ExportNotesInput {
                export_mode: ExportModeInput::NoteFilter,
                note_filter: Some(NoteFilterInput::All),
                tag_path: None,
                preserve_tags: false,
                export_dir: export_dir.to_string_lossy().into_owned(),
            })
            .unwrap();

        assert_eq!(count, 1);
        let exported = std::fs::read_to_string(export_dir.join("Tagged.md")).unwrap();
        assert!(!exported.contains("#work"));
        assert!(!exported.contains("#project-alpha"));

        let _ = std::fs::remove_dir_all(export_dir);
    }

    #[test]
    fn search_tags_excludes_orphaned_rows_but_keeps_linked_ancestors() {
        let (conn, _export_dir) = setup_export_repo();
        insert_tag(&conn, 1, "work");
        insert_tag(&conn, 2, "work/project");
        insert_tag(&conn, 3, "orphaned");

        insert_note(&conn, "n1", "Tagged", "# Tagged\n\n#work/project", 10);
        conn.execute(
            "INSERT INTO note_tag_links (note_id, tag_id, is_direct) VALUES
             ('n1', 2, 1),
             ('n1', 1, 0)",
            [],
        )
        .unwrap();

        let repo = SqliteNoteRepository::new(&conn);
        let results = repo.search_tags("or").unwrap();
        assert!(!results.iter().any(|tag| tag == "orphaned"));

        let work_results = repo.search_tags("work").unwrap();
        assert!(work_results.iter().any(|tag| tag == "work"));
        assert!(work_results.iter().any(|tag| tag == "work/project"));
    }

    #[test]
    fn next_vector_clock_json_merges_conflict_clocks_before_incrementing() {
        let mut conn = Connection::open_in_memory().unwrap();
        account_migrations().to_latest(&mut conn).unwrap();
        conn.execute(
            "INSERT INTO app_settings (key, value) VALUES (?1, ?2)",
            params![DEVICE_ID_KEY, "DEVICE-A"],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO notes
               (id, title, markdown, created_at, modified_at, edited_at, last_edit_device_id, vector_clock, locally_modified)
             VALUES
               (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 1)",
            params![
                "note-1",
                "Title",
                "# Title",
                1000,
                1000,
                1000,
                "DEVICE-A",
                "{\"DEVICE-A\":1}",
            ],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO note_conflicts
               (snapshot_event_id, note_id, op, device_id, vector_clock, title, markdown, modified_at, edited_at, deleted_at, archived_at, pinned_at, readonly, created_at)
             VALUES
               (?1, ?2, 'put', ?3, ?4, ?5, ?6, ?7, ?8, NULL, NULL, NULL, 0, ?9)",
            params![
                "evt-conflict-b",
                "note-1",
                "DEVICE-B",
                "{\"DEVICE-B\":3}",
                "Conflict",
                "# Conflict",
                2000,
                2000,
                1000,
            ],
        )
        .unwrap();

        let repo = SqliteNoteRepository::new(&conn);
        let (device_id, next_clock_json) = repo.next_vector_clock_json("note-1").unwrap();
        let next_clock = parse_vector_clock(&next_clock_json).unwrap();

        assert_eq!(device_id, "DEVICE-A");
        assert_eq!(
            next_clock,
            BTreeMap::from([("DEVICE-A".to_string(), 2), ("DEVICE-B".to_string(), 3),])
        );
    }

    #[test]
    fn resolve_wikilink_does_not_fallback_for_broken_explicit_target() {
        let mut conn = Connection::open_in_memory().unwrap();
        account_migrations().to_latest(&mut conn).unwrap();

        conn.execute(
            "INSERT INTO notes
               (id, title, markdown, created_at, modified_at, edited_at, deleted_at, locally_modified)
             VALUES
               ('source', 'Source', '# Source\n\n[[Alpha]]', 1, 1, 1, NULL, 1),
               ('target-explicit', 'Alpha', '# Alpha', 1, 1, 1, 10, 1),
               ('target-fallback', 'Alpha', '# Alpha', 2, 2, 2, NULL, 1)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO note_wikilinks
               (source_note_id, occurrence_id, location, title, normalized_title, target_note_id, is_explicit)
             VALUES
               ('source', 'EXPLICIT1', 10, 'Alpha', 'alpha', 'target-explicit', 1)",
            [],
        )
        .unwrap();

        let repo = SqliteNoteRepository::new(&conn);
        let resolved = repo
            .resolve_wikilink(&ResolveWikilinkInput {
                source_note_id: "source".to_string(),
                location: 10,
                title: "Alpha".to_string(),
            })
            .unwrap();

        assert_eq!(resolved, None);
    }

    #[test]
    fn active_wikilink_resolutions_for_note_excludes_deleted_targets() {
        let mut conn = Connection::open_in_memory().unwrap();
        account_migrations().to_latest(&mut conn).unwrap();

        conn.execute(
            "INSERT INTO notes
               (id, title, markdown, created_at, modified_at, edited_at, deleted_at, locally_modified)
             VALUES
               ('source', 'Source', '# Source\n\n[[Alpha]] [[Beta]]', 1, 1, 1, NULL, 1),
               ('target-active', 'Alpha', '# Alpha', 1, 1, 1, NULL, 1),
               ('target-deleted', 'Beta', '# Beta', 1, 1, 1, 10, 1)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO note_wikilinks
               (source_note_id, occurrence_id, location, title, normalized_title, target_note_id, is_explicit)
             VALUES
               ('source', 'A1', 10, 'Alpha', 'alpha', 'target-active', 1),
               ('source', 'B1', 20, 'Beta', 'beta', 'target-deleted', 1)",
            [],
        )
        .unwrap();

        let resolutions = active_wikilink_resolutions_for_note(&conn, "source").unwrap();

        assert_eq!(resolutions.len(), 1);
        assert_eq!(resolutions[0].target_note_id, "target-active");
        assert_eq!(resolutions[0].title, "Alpha");
    }
}

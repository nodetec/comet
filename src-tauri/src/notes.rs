use crate::db::{database_connection, extract_tags};
use crate::nostr;
use rusqlite::{
    params, params_from_iter, types::Value, Connection, OptionalExtension, Transaction,
};
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::AppHandle;

const LAST_OPEN_NOTE_KEY: &str = "last_open_note_id";
const INITIAL_NOTES_PAGE_SIZE: usize = 40;
const MAX_NOTES_PAGE_SIZE: usize = 100;

enum SearchMode {
    Match(String),
    Like(Vec<String>),
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NotebookSummary {
    pub id: String,
    pub name: String,
    pub note_count: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NotebookRef {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteSummary {
    pub id: String,
    pub title: String,
    pub notebook: Option<NotebookRef>,
    pub modified_at: i64,
    pub preview: String,
    pub search_snippet: Option<String>,
    pub archived_at: Option<i64>,
    pub pinned_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadedNote {
    pub id: String,
    pub title: String,
    pub notebook: Option<NotebookRef>,
    pub modified_at: i64,
    pub markdown: String,
    pub archived_at: Option<i64>,
    pub pinned_at: Option<i64>,
    pub tags: Vec<String>,
    pub nostr_d_tag: Option<String>,
    pub published_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NotePagePayload {
    pub notes: Vec<NoteSummary>,
    pub has_more: bool,
    pub next_offset: Option<usize>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextualTagsPayload {
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BootstrapPayload {
    pub npub: String,
    pub notebooks: Vec<NotebookSummary>,
    pub selected_note_id: Option<String>,
    pub initial_notes: NotePagePayload,
    pub initial_tags: ContextualTagsPayload,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum NoteFilterInput {
    All,
    Today,
    Archive,
    Notebook,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteQueryInput {
    pub note_filter: NoteFilterInput,
    pub active_notebook_id: Option<String>,
    pub search_query: String,
    pub active_tags: Vec<String>,
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
    pub active_notebook_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveNoteInput {
    pub id: String,
    pub markdown: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateNotebookInput {
    pub name: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenameNotebookInput {
    pub notebook_id: String,
    pub name: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssignNoteNotebookInput {
    pub note_id: String,
    pub notebook_id: Option<String>,
}

pub fn bootstrap(app: &AppHandle) -> Result<BootstrapPayload, String> {
    let conn = database_connection(app)?;
    let npub = nostr::ensure_identity(&conn)?;
    seed_welcome_note_if_empty(&conn)?;

    let notebooks = list_notebooks(&conn)?;
    let selected_note_id = last_open_note_id(&conn)?
        .filter(|note_id| note_is_active(&conn, note_id).unwrap_or(false))
        .or_else(|| next_active_note_id(&conn, None).ok().flatten());

    let initial_notes = query_note_page(
        &conn,
        &NoteQueryInput {
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
    let initial_tags = query_contextual_tags(
        &conn,
        &ContextualTagsInput {
            note_filter: NoteFilterInput::All,
            active_notebook_id: None,
        },
    )?;

    Ok(BootstrapPayload {
        npub,
        notebooks,
        selected_note_id,
        initial_notes,
        initial_tags,
    })
}

pub fn query_notes(app: &AppHandle, input: NoteQueryInput) -> Result<NotePagePayload, String> {
    let conn = database_connection(app)?;
    query_note_page(&conn, &input)
}

pub fn contextual_tags(
    app: &AppHandle,
    input: ContextualTagsInput,
) -> Result<ContextualTagsPayload, String> {
    let conn = database_connection(app)?;
    query_contextual_tags(&conn, &input)
}

pub fn load_note(app: &AppHandle, note_id: &str) -> Result<LoadedNote, String> {
    validate_note_id(note_id)?;
    let conn = database_connection(app)?;

    let note = note_by_id(&conn, note_id)?.ok_or_else(|| "Note not found.".to_string())?;

    set_last_open_note_id(&conn, Some(note_id))?;
    Ok(note)
}

pub fn create_note(
    app: &AppHandle,
    notebook_id: Option<&str>,
    tags: &[String],
) -> Result<LoadedNote, String> {
    let mut conn = database_connection(app)?;
    let transaction = conn.transaction().map_err(|error| error.to_string())?;
    let note_id = generate_note_id();
    let markdown = if tags.is_empty() {
        String::new()
    } else {
        let tag_line = tags.iter().map(|t| format!("#{t}")).collect::<Vec<_>>().join(" ");
        tag_line
    };
    let title = title_from_markdown(&markdown);
    let now = current_timestamp_millis();

    transaction
        .execute(
            "INSERT INTO notes (id, title, markdown, notebook_id, created_at, modified_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?5)",
            params![note_id, title, markdown, notebook_id, now],
        )
        .map_err(|error| error.to_string())?;
    upsert_note_search_document(&transaction, &note_id, &title, &markdown)?;
    if !tags.is_empty() {
        replace_note_tags(&transaction, &note_id, &markdown)?;
    }
    transaction.commit().map_err(|error| error.to_string())?;

    set_last_open_note_id(&conn, Some(&note_id))?;
    note_by_id(&conn, &note_id)?.ok_or_else(|| "Note not found.".to_string())
}

pub fn save_note(app: &AppHandle, input: SaveNoteInput) -> Result<LoadedNote, String> {
    validate_note_id(&input.id)?;
    let mut conn = database_connection(app)?;
    let title = title_from_markdown(&input.markdown);

    let transaction = conn.transaction().map_err(|error| error.to_string())?;

    // Only update modified_at when the markdown content actually changed.
    // The editor may re-serialize markdown with minor normalization differences,
    // which triggers a save even though the user made no real edits.
    let existing_markdown: String = transaction
        .query_row(
            "SELECT markdown FROM notes WHERE id = ?1",
            params![input.id],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;

    let content_changed = existing_markdown != input.markdown;

    let updated = if content_changed {
        let now = current_timestamp_millis();
        transaction
            .execute(
                "UPDATE notes SET title = ?1, markdown = ?2, modified_at = ?3 WHERE id = ?4",
                params![title, input.markdown, now, input.id],
            )
            .map_err(|error| error.to_string())?
    } else {
        transaction
            .execute(
                "UPDATE notes SET title = ?1, markdown = ?2 WHERE id = ?3",
                params![title, input.markdown, input.id],
            )
            .map_err(|error| error.to_string())?
    };

    if updated == 0 {
        return Err("Note not found.".to_string());
    }

    upsert_note_search_document(&transaction, &input.id, &title, &input.markdown)?;
    replace_note_tags(&transaction, &input.id, &input.markdown)?;
    transaction.commit().map_err(|error| error.to_string())?;
    set_last_open_note_id(&conn, Some(&input.id))?;

    note_by_id(&conn, &input.id)?.ok_or_else(|| "Note not found.".to_string())
}

pub fn archive_note(app: &AppHandle, note_id: &str) -> Result<LoadedNote, String> {
    validate_note_id(note_id)?;
    let conn = database_connection(app)?;
    let now = current_timestamp_millis();

    let updated = conn
        .execute(
            "UPDATE notes
             SET archived_at = ?1, pinned_at = NULL, modified_at = ?1
             WHERE id = ?2 AND archived_at IS NULL",
            params![now, note_id],
        )
        .map_err(|error| error.to_string())?;

    if updated == 0 {
        return Err("Note not found.".to_string());
    }

    if last_open_note_id(&conn)?.as_deref() == Some(note_id) {
        set_last_open_note_id(&conn, next_active_note_id(&conn, Some(note_id))?.as_deref())?;
    }

    note_by_id(&conn, note_id)?.ok_or_else(|| "Note not found.".to_string())
}

pub fn restore_note(app: &AppHandle, note_id: &str) -> Result<LoadedNote, String> {
    validate_note_id(note_id)?;
    let conn = database_connection(app)?;
    let now = current_timestamp_millis();

    let updated = conn
        .execute(
            "UPDATE notes
             SET archived_at = NULL, modified_at = ?1
             WHERE id = ?2 AND archived_at IS NOT NULL",
            params![now, note_id],
        )
        .map_err(|error| error.to_string())?;

    if updated == 0 {
        return Err("Note not found.".to_string());
    }

    note_by_id(&conn, note_id)?.ok_or_else(|| "Note not found.".to_string())
}

pub fn delete_note_permanently(app: &AppHandle, note_id: &str) -> Result<(), String> {
    validate_note_id(note_id)?;
    let mut conn = database_connection(app)?;
    let transaction = conn.transaction().map_err(|error| error.to_string())?;

    delete_note_search_document(&transaction, note_id)?;
    let deleted = transaction
        .execute("DELETE FROM notes WHERE id = ?1", params![note_id])
        .map_err(|error| error.to_string())?;

    if deleted == 0 {
        return Err("Note not found.".to_string());
    }

    transaction.commit().map_err(|error| error.to_string())?;

    if last_open_note_id(&conn)?.as_deref() == Some(note_id) {
        set_last_open_note_id(&conn, next_active_note_id(&conn, Some(note_id))?.as_deref())?;
    }

    Ok(())
}

pub fn create_notebook(
    app: &AppHandle,
    input: CreateNotebookInput,
) -> Result<NotebookSummary, String> {
    let conn = database_connection(app)?;
    let notebook_id = generate_notebook_id();
    let name = normalize_notebook_name(&input.name)?;
    let now = current_timestamp_millis();

    conn.execute(
        "INSERT INTO notebooks (id, name, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?3)",
        params![notebook_id, name, now],
    )
    .map_err(handle_notebook_write_error)?;

    notebook_by_id(&conn, &notebook_id)?.ok_or_else(|| "Failed to create notebook.".to_string())
}

pub fn rename_notebook(
    app: &AppHandle,
    input: RenameNotebookInput,
) -> Result<NotebookSummary, String> {
    validate_notebook_id(&input.notebook_id)?;
    let conn = database_connection(app)?;
    let name = normalize_notebook_name(&input.name)?;

    let updated = conn
        .execute(
            "UPDATE notebooks SET name = ?1, updated_at = ?2 WHERE id = ?3",
            params![name, current_timestamp_millis(), input.notebook_id],
        )
        .map_err(handle_notebook_write_error)?;

    if updated == 0 {
        return Err("Notebook not found.".to_string());
    }

    notebook_by_id(&conn, &input.notebook_id)?
        .ok_or_else(|| "Failed to rename notebook.".to_string())
}

pub fn delete_notebook(app: &AppHandle, notebook_id: &str) -> Result<(), String> {
    validate_notebook_id(notebook_id)?;
    let conn = database_connection(app)?;
    let deleted = conn
        .execute("DELETE FROM notebooks WHERE id = ?1", params![notebook_id])
        .map_err(|error| error.to_string())?;

    if deleted == 0 {
        return Err("Notebook not found.".to_string());
    }

    Ok(())
}

pub fn assign_note_notebook(
    app: &AppHandle,
    input: AssignNoteNotebookInput,
) -> Result<LoadedNote, String> {
    validate_note_id(&input.note_id)?;
    if let Some(notebook_id) = input.notebook_id.as_deref() {
        validate_notebook_id(notebook_id)?;
    }

    let conn = database_connection(app)?;

    if let Some(notebook_id) = input.notebook_id.as_deref() {
        let exists = conn
            .query_row(
                "SELECT 1 FROM notebooks WHERE id = ?1 LIMIT 1",
                params![notebook_id],
                |_| Ok(()),
            )
            .optional()
            .map_err(|error| error.to_string())?
            .is_some();

        if !exists {
            return Err("Notebook not found.".to_string());
        }
    }

    let now = current_timestamp_millis();
    let updated = conn
        .execute(
            "UPDATE notes SET notebook_id = ?1, modified_at = ?2 WHERE id = ?3",
            params![input.notebook_id, now, input.note_id],
        )
        .map_err(|error| error.to_string())?;

    if updated == 0 {
        return Err("Note not found.".to_string());
    }

    set_last_open_note_id(&conn, Some(&input.note_id))?;

    note_by_id(&conn, &input.note_id)?.ok_or_else(|| "Note not found.".to_string())
}

pub fn pin_note(app: &AppHandle, note_id: &str) -> Result<LoadedNote, String> {
    validate_note_id(note_id)?;
    let conn = database_connection(app)?;
    let updated = conn
        .execute(
            "UPDATE notes
             SET pinned_at = ?1, modified_at = ?1
             WHERE id = ?2 AND archived_at IS NULL",
            params![current_timestamp_millis(), note_id],
        )
        .map_err(|error| error.to_string())?;

    if updated == 0 {
        return Err("Note not found.".to_string());
    }

    note_by_id(&conn, note_id)?.ok_or_else(|| "Note not found.".to_string())
}

pub fn unpin_note(app: &AppHandle, note_id: &str) -> Result<LoadedNote, String> {
    validate_note_id(note_id)?;
    let conn = database_connection(app)?;
    let updated = conn
        .execute(
            "UPDATE notes SET pinned_at = NULL, modified_at = ?1 WHERE id = ?2",
            params![current_timestamp_millis(), note_id],
        )
        .map_err(|error| error.to_string())?;

    if updated == 0 {
        return Err("Note not found.".to_string());
    }

    note_by_id(&conn, note_id)?.ok_or_else(|| "Note not found.".to_string())
}

fn query_note_page(conn: &Connection, input: &NoteQueryInput) -> Result<NotePagePayload, String> {
    if input.note_filter == NoteFilterInput::Notebook && input.active_notebook_id.is_none() {
        return Ok(NotePagePayload {
            notes: Vec::new(),
            has_more: false,
            next_offset: None,
        });
    }

    let limit = input.limit.clamp(1, MAX_NOTES_PAGE_SIZE);
    let search_tokens = search_tokens_from_query(&input.search_query);
    let search_mode = search_mode_from_tokens(&search_tokens);
    let active_tags = normalized_active_tags(&input.active_tags);

    let mut sql = String::from(
        "SELECT n.id, n.title, n.markdown, n.modified_at, b.id, b.name, n.archived_at, n.pinned_at
         FROM notes n
         LEFT JOIN notebooks b ON b.id = n.notebook_id",
    );
    let mut clauses = Vec::new();
    let mut values = Vec::new();

    if let Some(search_mode) = &search_mode {
        match search_mode {
            SearchMode::Match(search_query) => {
                sql = String::from(
                    "SELECT n.id, n.title, n.markdown, n.modified_at, b.id, b.name, n.archived_at, n.pinned_at
                     FROM notes n
                     LEFT JOIN notebooks b ON b.id = n.notebook_id
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

    append_note_view_clauses(
        &mut clauses,
        &mut values,
        input.note_filter,
        input.active_notebook_id.as_deref(),
    );

    for tag in &active_tags {
        clauses.push(
            "EXISTS (
               SELECT 1
               FROM note_tags nt_filter
               WHERE nt_filter.note_id = n.id
                 AND nt_filter.tag = ?
             )"
            .to_string(),
        );
        values.push(Value::from(tag.clone()));
    }

    if !clauses.is_empty() {
        sql.push_str(" WHERE ");
        sql.push_str(&clauses.join(" AND "));
    }

    let sort_column = match input.sort_field {
        NoteSortField::ModifiedAt => "n.modified_at",
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
        " ORDER BY n.pinned_at IS NULL ASC, n.pinned_at DESC, {} {}, n.created_at DESC
          LIMIT ? OFFSET ?",
        sort_column, sort_dir,
    ));
    values.push(Value::from((limit + 1) as i64));
    values.push(Value::from(input.offset as i64));

    let mut statement = conn.prepare(&sql).map_err(|error| error.to_string())?;
    let rows = statement
        .query_map(params_from_iter(values.iter()), |row| {
            row_to_note_summary(row, &search_tokens)
        })
        .map_err(|error| error.to_string())?;

    let mut notes = Vec::new();
    for row in rows {
        notes.push(row.map_err(|error| error.to_string())?);
    }

    let has_more = notes.len() > limit;
    if has_more {
        notes.truncate(limit);
    }

    Ok(NotePagePayload {
        next_offset: has_more.then_some(input.offset + limit),
        has_more,
        notes,
    })
}

fn query_contextual_tags(
    conn: &Connection,
    input: &ContextualTagsInput,
) -> Result<ContextualTagsPayload, String> {
    if input.note_filter == NoteFilterInput::Notebook && input.active_notebook_id.is_none() {
        return Ok(ContextualTagsPayload { tags: Vec::new() });
    }

    let mut sql = String::from(
        "SELECT DISTINCT nt.tag
         FROM notes n
         JOIN note_tags nt ON nt.note_id = n.id",
    );
    let mut clauses = Vec::new();
    let mut values = Vec::new();

    append_note_view_clauses(
        &mut clauses,
        &mut values,
        input.note_filter,
        input.active_notebook_id.as_deref(),
    );

    if !clauses.is_empty() {
        sql.push_str(" WHERE ");
        sql.push_str(&clauses.join(" AND "));
    }

    sql.push_str(" ORDER BY nt.tag ASC");

    let mut statement = conn.prepare(&sql).map_err(|error| error.to_string())?;
    let rows = statement
        .query_map(params_from_iter(values.iter()), |row| {
            row.get::<_, String>(0)
        })
        .map_err(|error| error.to_string())?;

    let mut tags = Vec::new();
    for row in rows {
        tags.push(row.map_err(|error| error.to_string())?);
    }

    Ok(ContextualTagsPayload { tags })
}

fn append_note_view_clauses(
    clauses: &mut Vec<String>,
    values: &mut Vec<Value>,
    note_filter: NoteFilterInput,
    active_notebook_id: Option<&str>,
) {
    match note_filter {
        NoteFilterInput::All => {
            clauses.push("n.archived_at IS NULL".to_string());
        }
        NoteFilterInput::Today => {
            clauses.push("n.archived_at IS NULL".to_string());
            clauses.push("n.modified_at >= ?".to_string());
            values.push(Value::from(current_timestamp_millis() - 24 * 60 * 60 * 1000));
        }
        NoteFilterInput::Archive => {
            clauses.push("n.archived_at IS NOT NULL".to_string());
        }
        NoteFilterInput::Notebook => {
            clauses.push("n.archived_at IS NULL".to_string());
            clauses.push("n.notebook_id = ?".to_string());
            values.push(Value::from(
                active_notebook_id.unwrap_or_default().to_string(),
            ));
        }
    }
}

fn note_is_active(conn: &Connection, note_id: &str) -> Result<bool, String> {
    conn.query_row(
        "SELECT archived_at IS NULL FROM notes WHERE id = ?1",
        params![note_id],
        |row| row.get::<_, bool>(0),
    )
    .optional()
    .map_err(|error| error.to_string())
    .map(|value| value.unwrap_or(false))
}

fn seed_welcome_note_if_empty(conn: &Connection) -> Result<(), String> {
    let note_count = conn
        .query_row("SELECT COUNT(*) FROM notes", [], |row| row.get::<_, i64>(0))
        .map_err(|error| error.to_string())?;

    if note_count > 0 {
        return Ok(());
    }

    let markdown = r#"# Leave a trail

Welcome to comet.

Comet stores note content locally in its own database, with markdown as the underlying format.

## Start here

- Create a note
- Edit it freely
- Come back later and pick up the thread
- Publish when the note is ready
"#;

    let transaction = conn
        .unchecked_transaction()
        .map_err(|error| error.to_string())?;
    let now = current_timestamp_millis();
    let title = title_from_markdown(markdown);

    transaction
        .execute(
            "INSERT INTO notes (id, title, markdown, notebook_id, created_at, modified_at)
             VALUES (?1, ?2, ?3, NULL, ?4, ?4)",
            params!["welcome", title, markdown, now],
        )
        .map_err(|error| error.to_string())?;
    upsert_note_search_document(&transaction, "welcome", &title, markdown)?;
    replace_note_tags(&transaction, "welcome", markdown)?;
    transaction.commit().map_err(|error| error.to_string())?;

    Ok(())
}

fn list_notebooks(conn: &Connection) -> Result<Vec<NotebookSummary>, String> {
    let mut statement = conn
        .prepare(
            "SELECT b.id, b.name, COUNT(n.id) AS note_count
             FROM notebooks b
             LEFT JOIN notes n ON n.notebook_id = b.id AND n.archived_at IS NULL
             GROUP BY b.id, b.name, b.created_at
             ORDER BY LOWER(b.name) ASC, b.created_at ASC",
        )
        .map_err(|error| error.to_string())?;

    let rows = statement
        .query_map([], |row| {
            Ok(NotebookSummary {
                id: row.get(0)?,
                name: row.get(1)?,
                note_count: row.get::<_, i64>(2)? as usize,
            })
        })
        .map_err(|error| error.to_string())?;

    let mut notebooks = Vec::new();
    for row in rows {
        notebooks.push(row.map_err(|error| error.to_string())?);
    }

    Ok(notebooks)
}

fn notebook_by_id(conn: &Connection, notebook_id: &str) -> Result<Option<NotebookSummary>, String> {
    conn.query_row(
        "SELECT b.id, b.name, COUNT(n.id) AS note_count
         FROM notebooks b
         LEFT JOIN notes n ON n.notebook_id = b.id AND n.archived_at IS NULL
         WHERE b.id = ?1
         GROUP BY b.id, b.name",
        params![notebook_id],
        |row| {
            Ok(NotebookSummary {
                id: row.get(0)?,
                name: row.get(1)?,
                note_count: row.get::<_, i64>(2)? as usize,
            })
        },
    )
    .optional()
    .map_err(|error| error.to_string())
}

fn last_open_note_id(conn: &Connection) -> Result<Option<String>, String> {
    conn.query_row(
        "SELECT value FROM app_settings WHERE key = ?1",
        params![LAST_OPEN_NOTE_KEY],
        |row| row.get(0),
    )
    .optional()
    .map_err(|error| error.to_string())
}

fn set_last_open_note_id(conn: &Connection, note_id: Option<&str>) -> Result<(), String> {
    if let Some(note_id) = note_id {
        conn.execute(
            "INSERT INTO app_settings (key, value)
             VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![LAST_OPEN_NOTE_KEY, note_id],
        )
        .map_err(|error| error.to_string())?;
    } else {
        conn.execute(
            "DELETE FROM app_settings WHERE key = ?1",
            params![LAST_OPEN_NOTE_KEY],
        )
        .map_err(|error| error.to_string())?;
    }

    Ok(())
}

fn row_to_loaded_note(row: &rusqlite::Row<'_>) -> rusqlite::Result<LoadedNote> {
    let notebook_id: Option<String> = row.get(4)?;
    let notebook_name: Option<String> = row.get(5)?;

    Ok(LoadedNote {
        id: row.get(0)?,
        title: row.get(1)?,
        markdown: row.get(2)?,
        modified_at: row.get(3)?,
        notebook: notebook_id
            .zip(notebook_name)
            .map(|(id, name)| NotebookRef { id, name }),
        archived_at: row.get(6)?,
        pinned_at: row.get(7)?,
        tags: Vec::new(),
        nostr_d_tag: row.get(8)?,
        published_at: row.get(9)?,
    })
}

fn row_to_note_summary(
    row: &rusqlite::Row<'_>,
    search_tokens: &[String],
) -> rusqlite::Result<NoteSummary> {
    let markdown: String = row.get(2)?;
    let notebook_id: Option<String> = row.get(4)?;
    let notebook_name: Option<String> = row.get(5)?;

    Ok(NoteSummary {
        id: row.get(0)?,
        title: row.get(1)?,
        notebook: notebook_id
            .zip(notebook_name)
            .map(|(id, name)| NotebookRef { id, name }),
        modified_at: row.get(3)?,
        preview: preview_from_markdown(&markdown),
        search_snippet: search_snippet_for_summary(&markdown, search_tokens),
        archived_at: row.get(6)?,
        pinned_at: row.get(7)?,
    })
}

fn note_by_id(conn: &Connection, note_id: &str) -> Result<Option<LoadedNote>, String> {
    let note = conn
        .query_row(
            "SELECT n.id, n.title, n.markdown, n.modified_at, b.id, b.name, n.archived_at, n.pinned_at, n.nostr_d_tag, n.published_at
             FROM notes n
             LEFT JOIN notebooks b ON b.id = n.notebook_id
             WHERE n.id = ?1",
            params![note_id],
            row_to_loaded_note,
        )
        .optional()
        .map_err(|error| error.to_string())?;

    note.map(|mut note| {
        note.tags = tags_for_note(conn, &note.id)?;
        Ok(note)
    })
    .transpose()
}

fn next_active_note_id(
    conn: &Connection,
    excluding_note_id: Option<&str>,
) -> Result<Option<String>, String> {
    conn.query_row(
        "SELECT id
         FROM notes
         WHERE archived_at IS NULL
           AND (?1 IS NULL OR id != ?1)
         ORDER BY pinned_at IS NULL ASC, pinned_at DESC, modified_at DESC, created_at DESC
         LIMIT 1",
        params![excluding_note_id],
        |row| row.get(0),
    )
    .optional()
    .map_err(|error| error.to_string())
}

fn title_from_markdown(markdown: &str) -> String {
    markdown
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .find_map(|line| {
            if !line.starts_with('#') {
                return None;
            }
            let cleaned = line.trim_start_matches('#').trim();
            (!cleaned.is_empty()).then(|| cleaned.to_string())
        })
        .unwrap_or_default()
}

fn preview_from_markdown(markdown: &str) -> String {
    let mut skipped_title = false;
    let mut preview = String::with_capacity(160);
    for line in markdown.lines().map(str::trim) {
        if line.is_empty() || line.starts_with("```") {
            continue;
        }
        if !skipped_title && line.starts_with('#') {
            skipped_title = true;
            continue;
        }
        if !preview.is_empty() {
            preview.push(' ');
        }
        preview.push_str(line);
        if preview.len() >= 140 {
            break;
        }
    }
    preview.truncate(preview.chars().take(140).map(|c| c.len_utf8()).sum());
    preview
}

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

            normalized_text.find(&normalized_token).map(|index| {
                let end = index + normalized_token.len();
                (index, end)
            })
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
        snippet = format!("…{snippet}");
    }
    if end < text.len() {
        snippet.push('…');
    }

    Some(snippet)
}

fn replace_note_tags(
    transaction: &Transaction<'_>,
    note_id: &str,
    markdown: &str,
) -> Result<(), String> {
    let next_tags = extract_tags(markdown);
    let current_tags = tags_for_note_in_transaction(transaction, note_id)?;

    if current_tags == next_tags {
        return Ok(());
    }

    // Both vecs are sorted and unique — linear scan to find diffs
    let mut ci = 0;
    let mut ni = 0;

    while ci < current_tags.len() && ni < next_tags.len() {
        match current_tags[ci].cmp(&next_tags[ni]) {
            std::cmp::Ordering::Less => {
                // In current but not next — remove
                transaction
                    .execute(
                        "DELETE FROM note_tags WHERE note_id = ?1 AND tag = ?2",
                        params![note_id, &current_tags[ci]],
                    )
                    .map_err(|error| error.to_string())?;
                ci += 1;
            }
            std::cmp::Ordering::Greater => {
                // In next but not current — add
                transaction
                    .execute(
                        "INSERT INTO note_tags (note_id, tag) VALUES (?1, ?2)",
                        params![note_id, &next_tags[ni]],
                    )
                    .map_err(|error| error.to_string())?;
                ni += 1;
            }
            std::cmp::Ordering::Equal => {
                ci += 1;
                ni += 1;
            }
        }
    }

    // Remaining current tags were removed
    while ci < current_tags.len() {
        transaction
            .execute(
                "DELETE FROM note_tags WHERE note_id = ?1 AND tag = ?2",
                params![note_id, &current_tags[ci]],
            )
            .map_err(|error| error.to_string())?;
        ci += 1;
    }

    // Remaining next tags are new
    while ni < next_tags.len() {
        transaction
            .execute(
                "INSERT INTO note_tags (note_id, tag) VALUES (?1, ?2)",
                params![note_id, &next_tags[ni]],
            )
            .map_err(|error| error.to_string())?;
        ni += 1;
    }

    Ok(())
}

fn upsert_note_search_document(
    transaction: &Transaction<'_>,
    note_id: &str,
    title: &str,
    markdown: &str,
) -> Result<(), String> {
    transaction
        .execute("DELETE FROM notes_fts WHERE note_id = ?1", params![note_id])
        .map_err(|error| error.to_string())?;
    transaction
        .execute(
            "INSERT INTO notes_fts (note_id, title, markdown) VALUES (?1, ?2, ?3)",
            params![note_id, title, markdown],
        )
        .map_err(|error| error.to_string())?;

    Ok(())
}

fn delete_note_search_document(transaction: &Transaction<'_>, note_id: &str) -> Result<(), String> {
    transaction
        .execute("DELETE FROM notes_fts WHERE note_id = ?1", params![note_id])
        .map_err(|error| error.to_string())?;

    Ok(())
}

fn tags_for_note(conn: &Connection, note_id: &str) -> Result<Vec<String>, String> {
    let mut statement = conn
        .prepare("SELECT tag FROM note_tags WHERE note_id = ?1 ORDER BY tag ASC")
        .map_err(|error| error.to_string())?;

    let rows = statement
        .query_map(params![note_id], |row| row.get::<_, String>(0))
        .map_err(|error| error.to_string())?;

    let mut tags = Vec::new();
    for row in rows {
        tags.push(row.map_err(|error| error.to_string())?);
    }

    Ok(tags)
}

fn tags_for_note_in_transaction(
    transaction: &Transaction<'_>,
    note_id: &str,
) -> Result<Vec<String>, String> {
    let mut statement = transaction
        .prepare("SELECT tag FROM note_tags WHERE note_id = ?1 ORDER BY tag ASC")
        .map_err(|error| error.to_string())?;

    let rows = statement
        .query_map(params![note_id], |row| row.get::<_, String>(0))
        .map_err(|error| error.to_string())?;

    let mut tags = Vec::new();
    for row in rows {
        tags.push(row.map_err(|error| error.to_string())?);
    }

    Ok(tags)
}

fn normalized_active_tags(tags: &[String]) -> Vec<String> {
    let mut unique_tags = BTreeSet::new();
    for tag in tags {
        let trimmed = tag.trim();
        if trimmed.is_empty() {
            continue;
        }

        unique_tags.insert(trimmed.to_ascii_lowercase());
    }

    unique_tags.into_iter().collect()
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

fn validate_note_id(note_id: &str) -> Result<(), String> {
    if note_id.is_empty()
        || note_id.contains('/')
        || note_id.contains('\\')
        || note_id.contains("..")
    {
        return Err("Invalid note id.".to_string());
    }

    Ok(())
}

fn validate_notebook_id(notebook_id: &str) -> Result<(), String> {
    if notebook_id.is_empty()
        || notebook_id.contains('/')
        || notebook_id.contains('\\')
        || notebook_id.contains("..")
    {
        return Err("Invalid notebook id.".to_string());
    }

    Ok(())
}

fn normalize_notebook_name(name: &str) -> Result<String, String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("Notebook name cannot be empty.".to_string());
    }

    if trimmed.len() > 80 {
        return Err("Notebook name is too long.".to_string());
    }

    Ok(trimmed.to_string())
}

fn current_timestamp_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or_default()
}

fn generate_note_id() -> String {
    format!("note-{}", current_timestamp_millis())
}

fn generate_notebook_id() -> String {
    format!("notebook-{}", current_timestamp_millis())
}

fn handle_notebook_write_error(error: rusqlite::Error) -> String {
    match error {
        rusqlite::Error::SqliteFailure(inner, _) if inner.extended_code == 2067 => {
            "A notebook with that name already exists.".to_string()
        }
        other => other.to_string(),
    }
}

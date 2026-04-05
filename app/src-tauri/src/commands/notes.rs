use crate::adapters::sqlite::note_repository::SqliteNoteRepository;
use crate::db::database_connection;
use crate::domain::common::text::preview_from_markdown;
use crate::domain::common::time::now_millis;
use crate::domain::notes::model::*;
use crate::domain::notes::service::NoteService;
use crate::domain::sync::model::SyncCommand;
use crate::error::AppError;
use crate::ports::note_repository::{NoteRecord, NoteRepository};
use rusqlite::{params, OptionalExtension};
use tauri::{AppHandle, Manager};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn sync_push(app: &AppHandle, cmd: SyncCommand) {
    let manager = app
        .state::<crate::adapters::nostr::sync_manager::SyncManager>()
        .inner()
        .clone();
    tauri::async_runtime::spawn(async move {
        manager.push(cmd).await;
    });
}

fn record_to_loaded_note(
    record: NoteRecord,
    repo: &SqliteNoteRepository,
) -> Result<LoadedNote, AppError> {
    let tags = repo.tags_for_note(&record.id)?;
    Ok(LoadedNote {
        id: record.id,
        title: record.title,
        modified_at: record.modified_at,
        markdown: record.markdown,
        archived_at: record.archived_at,
        deleted_at: record.deleted_at,
        pinned_at: record.pinned_at,
        readonly: record.readonly,
        tags,
        nostr_d_tag: record.nostr_d_tag,
        published_at: record.published_at,
        published_kind: record.published_kind,
    })
}

fn preferred_conflict_relay_url(conn: &rusqlite::Connection) -> Option<String> {
    let available =
        crate::adapters::sqlite::sync_repository::ordered_available_sync_relay_urls(conn);
    let active = crate::adapters::sqlite::sync_repository::get_active_sync_relay_url(conn);
    active
        .filter(|relay_url| available.contains(relay_url))
        .or_else(|| available.into_iter().next())
}

/// Spawn async Blossom blob deletions for orphaned blobs.
/// `blossom_deletions` is a list of (`server_url`, `ciphertext_hash`) pairs.
fn spawn_blossom_deletions(app: &AppHandle, blossom_deletions: Vec<(String, String)>) {
    if blossom_deletions.is_empty() {
        return;
    }

    let conn = match database_connection(app) {
        Ok(c) => c,
        Err(_) => return,
    };
    let (keys, _) = match crate::adapters::tauri::key_store::keys_for_current_identity(app, &conn) {
        Ok(identity) => identity,
        Err(_) => return,
    };
    drop(conn);

    tauri::async_runtime::spawn(async move {
        let client = reqwest::Client::new();
        for (server_url, ciphertext_hash) in blossom_deletions {
            if let Err(e) = crate::adapters::blossom::client::delete_blob(
                &client,
                &server_url,
                &ciphertext_hash,
                &keys,
            )
            .await
            {
                eprintln!("[blob-gc] failed to delete from Blossom: {e}");
            }
        }
    });
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn bootstrap(app: AppHandle) -> Result<BootstrapPayload, AppError> {
    let conn = database_connection(&app)?;
    let repo = SqliteNoteRepository::new(&conn);
    Ok(NoteService::bootstrap(&repo)?)
}

#[tauri::command]
pub fn todo_count(app: AppHandle) -> Result<i64, AppError> {
    let conn = database_connection(&app)?;
    let repo = SqliteNoteRepository::new(&conn);
    Ok(NoteService::todo_count(&repo)?)
}

#[tauri::command]
pub fn query_notes(app: AppHandle, input: NoteQueryInput) -> Result<NotePagePayload, AppError> {
    let conn = database_connection(&app)?;
    let repo = SqliteNoteRepository::new(&conn);
    Ok(NoteService::query_notes(&repo, input)?)
}

#[tauri::command]
pub fn contextual_tags(
    app: AppHandle,
    input: ContextualTagsInput,
) -> Result<ContextualTagsPayload, AppError> {
    let conn = database_connection(&app)?;
    let repo = SqliteNoteRepository::new(&conn);
    Ok(NoteService::contextual_tags(&repo, input)?)
}

#[tauri::command]
pub fn load_note(app: AppHandle, note_id: String) -> Result<LoadedNote, AppError> {
    let conn = database_connection(&app)?;
    let repo = SqliteNoteRepository::new(&conn);
    let record = NoteService::load_note(&repo, &note_id)?;
    record_to_loaded_note(record, &repo)
}

#[tauri::command]
pub async fn get_note_conflict(
    app: AppHandle,
    note_id: String,
) -> Result<Option<NoteConflictInfo>, AppError> {
    let conn = database_connection(&app)?;
    let current_note: Option<(Option<String>, String, String, i64)> = conn
        .query_row(
            "SELECT sync_event_id, title, markdown, modified_at FROM notes WHERE id = ?1",
            params![note_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .optional()?;
    let current_tombstone: Option<(Option<String>, i64)> = if current_note.is_none() {
        conn.query_row(
            "SELECT sync_event_id, deleted_at FROM note_tombstones WHERE id = ?1",
            params![note_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()?
    } else {
        None
    };

    let mut snapshots = Vec::new();
    let current_snapshot_id = current_note
        .as_ref()
        .map(|(sync_event_id, _, _, _)| {
            sync_event_id
                .clone()
                .unwrap_or_else(|| format!("local:{note_id}"))
        })
        .or_else(|| {
            current_tombstone.as_ref().map(|(sync_event_id, _)| {
                sync_event_id
                    .clone()
                    .unwrap_or_else(|| format!("local-deleted:{note_id}"))
            })
        });

    if let Some((sync_event_id, title, markdown, modified_at)) = current_note.as_ref() {
        snapshots.push(NoteConflictSnapshot {
            snapshot_id: sync_event_id
                .clone()
                .unwrap_or_else(|| format!("local:{note_id}")),
            mtime: *modified_at,
            op: "put".to_string(),
            deleted_at: None,
            title: Some(title.clone()),
            markdown: Some(markdown.clone()),
            preview: Some(preview_from_markdown(markdown)),
            is_current: true,
            is_available: true,
        });
    }
    if let Some((sync_event_id, deleted_at)) = current_tombstone.as_ref() {
        snapshots.push(NoteConflictSnapshot {
            snapshot_id: sync_event_id
                .clone()
                .unwrap_or_else(|| format!("local-deleted:{note_id}")),
            mtime: *deleted_at,
            op: "del".to_string(),
            deleted_at: Some(*deleted_at),
            title: None,
            markdown: None,
            preview: None,
            is_current: true,
            is_available: true,
        });
    }

    let mut stmt = conn.prepare(
        "SELECT sync_event_id, op, modified_at, deleted_at, title, markdown
         FROM note_conflicts
         WHERE note_id = ?1
         ORDER BY modified_at DESC, sync_event_id ASC",
    )?;
    let rows = stmt.query_map(params![note_id], |row| {
        let markdown: Option<String> = row.get(5)?;
        Ok(NoteConflictSnapshot {
            snapshot_id: row.get(0)?,
            op: row.get(1)?,
            mtime: row.get(2)?,
            deleted_at: row.get(3)?,
            title: row.get(4)?,
            preview: markdown.as_ref().map(|value| preview_from_markdown(value)),
            markdown,
            is_current: false,
            is_available: true,
        })
    })?;
    for row in rows {
        snapshots.push(row?);
    }

    if snapshots.len() <= 1 {
        return Ok(None);
    }
    let has_delete_candidate = snapshots.iter().any(|snapshot| snapshot.op == "del");

    snapshots.sort_by(|left, right| {
        right
            .is_current
            .cmp(&left.is_current)
            .then_with(|| right.is_available.cmp(&left.is_available))
            .then_with(|| right.mtime.cmp(&left.mtime))
            .then_with(|| left.snapshot_id.cmp(&right.snapshot_id))
    });

    Ok(Some(NoteConflictInfo {
        note_id,
        current_snapshot_id,
        snapshot_count: snapshots.len(),
        relay_url: None,
        has_delete_candidate,
        snapshots,
    }))
}

#[tauri::command]
pub async fn resolve_note_conflict(
    app: AppHandle,
    note_id: String,
    action: ResolveNoteConflictAction,
    markdown: Option<String>,
) -> Result<(), AppError> {
    let conn = database_connection(&app)?;
    let conflict_count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM note_conflicts WHERE note_id = ?1",
        params![note_id],
        |row| row.get(0),
    )?;
    if conflict_count == 0 {
        return Err(AppError::custom("Note is not conflicted."));
    }

    let (keys, _) = crate::adapters::tauri::key_store::keys_for_current_identity(&app, &conn)?;
    if matches!(
        action,
        ResolveNoteConflictAction::Restore | ResolveNoteConflictAction::Merge
    ) {
        let repo = SqliteNoteRepository::new(&conn);
        let conflict_markdown =
            markdown.ok_or_else(|| AppError::custom("Conflict resolution requires markdown"))?;
        let _ = NoteService::save_note(
            &repo,
            SaveNoteInput {
                id: note_id.clone(),
                markdown: conflict_markdown,
            },
        )?;
    }

    let relay_urls =
        crate::adapters::sqlite::sync_repository::ordered_available_sync_relay_urls(&conn);
    let active_relay_url = preferred_conflict_relay_url(&conn)
        .ok_or_else(|| AppError::custom("No sync relay configured"))?;
    let backup_relay_urls = relay_urls
        .into_iter()
        .filter(|relay_url| relay_url != &active_relay_url)
        .collect::<Vec<_>>();
    drop(conn);

    match action {
        ResolveNoteConflictAction::KeepDeleted => {
            crate::adapters::nostr::snapshot_push::push_deletion_snapshot(
                &app,
                &active_relay_url,
                &backup_relay_urls,
                &keys,
                &note_id,
            )
            .await?;
        }
        ResolveNoteConflictAction::Restore | ResolveNoteConflictAction::Merge => {
            crate::adapters::nostr::snapshot_push::push_note_snapshot(
                &app,
                &active_relay_url,
                &backup_relay_urls,
                &keys,
                &note_id,
            )
            .await?;
        }
    }

    let conn = database_connection(&app)?;
    crate::domain::sync::service::clear_note_conflicts(&conn, &note_id)?;

    Ok(())
}

#[tauri::command]
pub fn create_note(
    app: AppHandle,
    tags: Vec<String>,
    markdown: Option<String>,
) -> Result<LoadedNote, AppError> {
    let conn = database_connection(&app)?;
    let repo = SqliteNoteRepository::new(&conn);
    let record = NoteService::create_note(&repo, &tags, markdown.as_deref())?;
    record_to_loaded_note(record, &repo)
}

#[tauri::command]
pub fn duplicate_note(app: AppHandle, note_id: String) -> Result<LoadedNote, AppError> {
    let conn = database_connection(&app)?;
    let repo = SqliteNoteRepository::new(&conn);
    let record = NoteService::duplicate_note(&repo, &note_id)?;
    let note = record_to_loaded_note(record, &repo)?;
    sync_push(&app, SyncCommand::PushNote(note.id.clone()));
    Ok(note)
}

#[tauri::command]
pub fn save_note(app: AppHandle, input: SaveNoteInput) -> Result<LoadedNote, AppError> {
    let note_id = input.id.clone();
    let conn = database_connection(&app)?;
    let repo = SqliteNoteRepository::new(&conn);
    let (record, content_changed) = NoteService::save_note(&repo, input)?;
    let note = record_to_loaded_note(record, &repo)?;
    if content_changed {
        sync_push(&app, SyncCommand::PushNote(note_id));
    }
    Ok(note)
}

#[tauri::command]
pub fn set_note_readonly(
    app: AppHandle,
    input: SetNoteReadonlyInput,
) -> Result<LoadedNote, AppError> {
    let note_id = input.note_id.clone();
    let conn = database_connection(&app)?;
    let repo = SqliteNoteRepository::new(&conn);
    let record = NoteService::set_readonly(&repo, input)?;
    let note = record_to_loaded_note(record, &repo)?;
    sync_push(&app, SyncCommand::PushNote(note_id));
    Ok(note)
}

#[tauri::command]
pub fn rename_tag(app: AppHandle, input: RenameTagInput) -> Result<Vec<String>, AppError> {
    let conn = database_connection(&app)?;
    let repo = SqliteNoteRepository::new(&conn);
    let affected_note_ids = NoteService::rename_tag(&repo, input)?;

    for note_id in &affected_note_ids {
        sync_push(&app, SyncCommand::PushNote(note_id.clone()));
    }

    Ok(affected_note_ids)
}

#[tauri::command]
pub fn delete_tag(app: AppHandle, input: DeleteTagInput) -> Result<Vec<String>, AppError> {
    let conn = database_connection(&app)?;
    let repo = SqliteNoteRepository::new(&conn);
    let affected_note_ids = NoteService::delete_tag(&repo, input)?;

    for note_id in &affected_note_ids {
        sync_push(&app, SyncCommand::PushNote(note_id.clone()));
    }

    Ok(affected_note_ids)
}

#[tauri::command]
pub fn set_tag_pinned(app: AppHandle, input: SetTagPinnedInput) -> Result<(), AppError> {
    let conn = database_connection(&app)?;
    let repo = SqliteNoteRepository::new(&conn);
    NoteService::set_tag_pinned(&repo, input)?;
    Ok(())
}

#[tauri::command]
pub fn set_hide_subtag_notes(
    app: AppHandle,
    input: SetHideSubtagNotesInput,
) -> Result<(), AppError> {
    let conn = database_connection(&app)?;
    let repo = SqliteNoteRepository::new(&conn);
    NoteService::set_hide_subtag_notes(&repo, input)?;
    Ok(())
}

#[tauri::command]
pub fn archive_note(app: AppHandle, note_id: String) -> Result<LoadedNote, AppError> {
    let conn = database_connection(&app)?;
    let repo = SqliteNoteRepository::new(&conn);
    let record = NoteService::archive_note(&repo, &note_id)?;
    let note = record_to_loaded_note(record, &repo)?;
    sync_push(&app, SyncCommand::PushNote(note_id));
    Ok(note)
}

#[tauri::command]
pub fn restore_note(app: AppHandle, note_id: String) -> Result<LoadedNote, AppError> {
    let conn = database_connection(&app)?;
    let repo = SqliteNoteRepository::new(&conn);
    let record = NoteService::restore_note(&repo, &note_id)?;
    let note = record_to_loaded_note(record, &repo)?;
    sync_push(&app, SyncCommand::PushNote(note_id));
    Ok(note)
}

#[tauri::command]
pub fn trash_note(app: AppHandle, note_id: String) -> Result<LoadedNote, AppError> {
    let conn = database_connection(&app)?;
    let repo = SqliteNoteRepository::new(&conn);
    let record = NoteService::trash_note(&repo, &note_id)?;
    let note = record_to_loaded_note(record, &repo)?;
    sync_push(&app, SyncCommand::PushNote(note_id));
    Ok(note)
}

#[tauri::command]
pub fn restore_from_trash(app: AppHandle, note_id: String) -> Result<LoadedNote, AppError> {
    let conn = database_connection(&app)?;
    let repo = SqliteNoteRepository::new(&conn);
    let record = NoteService::restore_from_trash(&repo, &note_id)?;
    let note = record_to_loaded_note(record, &repo)?;
    sync_push(&app, SyncCommand::PushNote(note_id));
    Ok(note)
}

#[tauri::command]
pub fn delete_note_permanently(app: AppHandle, note_id: String) -> Result<(), AppError> {
    let conn = database_connection(&app)?;

    // Find orphaned blobs before deleting the note.
    let orphaned =
        crate::domain::blob::service::find_orphaned_blob_hashes(&conn, &[note_id.clone()])?;

    let repo = SqliteNoteRepository::new(&conn);
    let tombstoned =
        crate::domain::sync::service::tombstone_note_locally(&conn, &note_id, now_millis())?;
    if !tombstoned {
        return Err(AppError::custom(format!("Note not found: {note_id}")));
    }

    if repo.last_open_note_id()?.as_deref() == Some(note_id.as_str()) {
        let next = repo.next_active_note_id(Some(&note_id))?;
        repo.set_last_open_note_id(next.as_deref())?;
    }

    // Blob cleanup (needs AppHandle).
    let blossom_deletions =
        crate::domain::blob::service::cleanup_orphaned_blobs(&app, &conn, &orphaned);
    spawn_blossom_deletions(&app, blossom_deletions);

    // Record pending deletion for sync.
    let _ = conn.execute(
        "INSERT OR IGNORE INTO pending_deletions (entity_id, created_at) VALUES (?1, ?2)",
        rusqlite::params![note_id, now_millis()],
    );
    sync_push(&app, SyncCommand::PushDeletion(note_id));

    Ok(())
}

#[tauri::command]
pub fn empty_trash(app: AppHandle) -> Result<(), AppError> {
    let conn = database_connection(&app)?;

    // Collect trashed note IDs and find orphaned blobs before deleting.
    let repo = SqliteNoteRepository::new(&conn);
    let trashed_ids: Vec<String> = repo.trashed_note_ids()?;
    let orphaned = crate::domain::blob::service::find_orphaned_blob_hashes(&conn, &trashed_ids)?;
    let mut note_ids = Vec::new();
    for note_id in trashed_ids {
        if crate::domain::sync::service::tombstone_note_locally(&conn, &note_id, now_millis())? {
            note_ids.push(note_id);
        }
    }

    // Blob cleanup.
    let blossom_deletions =
        crate::domain::blob::service::cleanup_orphaned_blobs(&app, &conn, &orphaned);
    spawn_blossom_deletions(&app, blossom_deletions);

    // Record pending deletions.
    for note_id in &note_ids {
        let _ = conn.execute(
            "INSERT OR IGNORE INTO pending_deletions (entity_id, created_at) VALUES (?1, ?2)",
            rusqlite::params![note_id, now_millis()],
        );
        sync_push(&app, SyncCommand::PushDeletion(note_id.clone()));
    }

    Ok(())
}

#[tauri::command]
pub fn pin_note(app: AppHandle, note_id: String) -> Result<LoadedNote, AppError> {
    let conn = database_connection(&app)?;
    let repo = SqliteNoteRepository::new(&conn);
    let record = NoteService::pin_note(&repo, &note_id)?;
    let note = record_to_loaded_note(record, &repo)?;
    sync_push(&app, SyncCommand::PushNote(note_id));
    Ok(note)
}

#[tauri::command]
pub fn unpin_note(app: AppHandle, note_id: String) -> Result<LoadedNote, AppError> {
    let conn = database_connection(&app)?;
    let repo = SqliteNoteRepository::new(&conn);
    let record = NoteService::unpin_note(&repo, &note_id)?;
    let note = record_to_loaded_note(record, &repo)?;
    sync_push(&app, SyncCommand::PushNote(note_id));
    Ok(note)
}

#[tauri::command]
pub fn search_notes(app: AppHandle, query: String) -> Result<Vec<SearchResult>, AppError> {
    let conn = database_connection(&app)?;
    let repo = SqliteNoteRepository::new(&conn);
    Ok(NoteService::search_notes(&repo, &query)?)
}

#[tauri::command]
pub fn search_tags(app: AppHandle, query: String) -> Result<Vec<String>, AppError> {
    let conn = database_connection(&app)?;
    let repo = SqliteNoteRepository::new(&conn);
    Ok(NoteService::search_tags(&repo, &query)?)
}

#[tauri::command]
pub fn export_notes(app: AppHandle, input: ExportNotesInput) -> Result<usize, AppError> {
    let conn = database_connection(&app)?;
    let repo = SqliteNoteRepository::new(&conn);
    Ok(NoteService::export_notes(&repo, input)?)
}

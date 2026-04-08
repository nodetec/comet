use crate::adapters::sqlite::note_repository::SqliteNoteRepository;
use crate::adapters::sqlite::snapshot_view_repository::SqliteSnapshotViewRepository;
use crate::db::database_connection;
use crate::domain::common::text::title_from_markdown;
use crate::domain::common::time::now_millis;
use crate::domain::notes::model::*;
use crate::domain::notes::service::NoteService;
use crate::domain::sync::model::SyncCommand;
use crate::error::AppError;
use crate::ports::note_repository::{NoteRecord, NoteRepository};
use rusqlite::params;
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
    let wikilink_resolutions = repo.active_wikilink_resolutions_for_note(&record.id)?;
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
        wikilink_resolutions,
        nostr_d_tag: record.nostr_d_tag,
        published_at: record.published_at,
        published_kind: record.published_kind,
    })
}

fn preferred_conflict_relay_url(conn: &rusqlite::Connection) -> Option<String> {
    let available =
        crate::adapters::sqlite::sync_settings_repository::ordered_available_sync_relay_urls(conn);
    let active = crate::adapters::sqlite::sync_settings_repository::get_active_sync_relay_url(conn);
    active
        .filter(|relay_url| available.contains(relay_url))
        .or_else(|| available.into_iter().next())
}

fn load_conflict_snapshot_wikilink_resolutions(
    conn: &rusqlite::Connection,
    repo: &SqliteNoteRepository,
    note_id: &str,
    snapshot_id: Option<&str>,
) -> Result<Vec<WikiLinkResolutionInput>, AppError> {
    let Some(snapshot_id) = snapshot_id else {
        return Ok(repo.wikilink_resolutions_for_note(note_id)?);
    };

    let is_conflict_snapshot: bool = conn.query_row(
        "SELECT EXISTS(
           SELECT 1
           FROM note_conflicts
           WHERE snapshot_event_id = ?1
             AND note_id = ?2
         )",
        params![snapshot_id, note_id],
        |row| Ok(row.get::<_, i64>(0)? != 0),
    )?;

    if !is_conflict_snapshot {
        return Ok(repo.wikilink_resolutions_for_note(note_id)?);
    }

    let mut statement = conn.prepare(
        "SELECT occurrence_id, location, title, target_note_id
         FROM note_conflict_wikilinks
         WHERE snapshot_event_id = ?1
         ORDER BY location ASC, occurrence_id ASC",
    )?;
    let rows = statement.query_map(params![snapshot_id], |row| {
        Ok(WikiLinkResolutionInput {
            occurrence_id: row.get(0)?,
            is_explicit: true,
            location: row.get::<_, i64>(1)? as usize,
            title: row.get(2)?,
            target_note_id: row.get(3)?,
        })
    })?;

    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
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
pub fn get_note_history(app: AppHandle, note_id: String) -> Result<NoteHistoryInfo, AppError> {
    let conn = database_connection(&app)?;
    let repo = SqliteSnapshotViewRepository::new(&conn);
    repo.get_note_history(&note_id)
}

#[tauri::command]
pub async fn get_note_conflict(
    app: AppHandle,
    note_id: String,
) -> Result<Option<NoteConflictInfo>, AppError> {
    let conn = database_connection(&app)?;
    let repo = SqliteSnapshotViewRepository::new(&conn);
    repo.get_note_conflict(&note_id)
}

#[tauri::command]
pub async fn resolve_note_conflict(
    app: AppHandle,
    note_id: String,
    action: ResolveNoteConflictAction,
    markdown: Option<String>,
    snapshot_id: Option<String>,
    wikilink_resolutions: Option<Vec<WikiLinkResolutionInput>>,
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
        let title = title_from_markdown(&conflict_markdown);
        let (existing_markdown, is_readonly) = repo.note_markdown_and_readonly(&note_id)?;
        let wikilink_resolutions =
            wikilink_resolutions.unwrap_or(load_conflict_snapshot_wikilink_resolutions(
                &conn,
                &repo,
                &note_id,
                snapshot_id.as_deref(),
            )?);
        if is_readonly {
            return Err(AppError::custom("Note is read-only."));
        }

        if existing_markdown != conflict_markdown {
            let _ = NoteService::save_note(
                &repo,
                SaveNoteInput {
                    id: note_id.clone(),
                    markdown: conflict_markdown,
                    wikilink_resolutions: Some(wikilink_resolutions.clone()),
                },
            )?;
        } else {
            let now = now_millis();
            let (device_id, vector_clock) = repo.next_vector_clock_json(&note_id)?;
            conn.execute(
                "UPDATE notes
                 SET title = ?1,
                     markdown = ?2,
                     modified_at = ?3,
                     edited_at = ?3,
                     last_edit_device_id = ?4,
                     vector_clock = ?5,
                     snapshot_event_id = NULL,
                     locally_modified = 1
                 WHERE id = ?6",
                params![
                    title,
                    conflict_markdown,
                    now,
                    device_id,
                    vector_clock,
                    note_id,
                ],
            )?;
            repo.upsert_search_document(&note_id, &title, &conflict_markdown)?;
            repo.replace_tags(&note_id, &conflict_markdown)?;
            repo.replace_wikilinks(&note_id, &conflict_markdown, &wikilink_resolutions)?;
            repo.refresh_wikilink_targets(std::slice::from_ref(&title))?;
        }
    }

    let relay_urls =
        crate::adapters::sqlite::sync_settings_repository::ordered_available_sync_relay_urls(&conn);
    let active_relay_url = preferred_conflict_relay_url(&conn)
        .ok_or_else(|| AppError::custom("No sync relay configured"))?;
    let backup_relay_urls = relay_urls
        .into_iter()
        .filter(|relay_url| relay_url != &active_relay_url)
        .collect::<Vec<_>>();
    drop(conn);

    match action {
        ResolveNoteConflictAction::KeepDeleted => {
            let conn = database_connection(&app)?;
            if !crate::domain::sync::service::tombstone_note_locally(&conn, &note_id, now_millis())?
            {
                return Err(AppError::custom(format!("Note not found: {note_id}")));
            }
            let _ = conn.execute(
                "INSERT OR IGNORE INTO pending_deletions (entity_id, created_at) VALUES (?1, ?2)",
                params![note_id, now_millis()],
            );
            drop(conn);
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
pub fn save_note(app: AppHandle, input: SaveNoteInput) -> Result<SaveNoteResponse, AppError> {
    let note_id = input.id.clone();
    let conn = database_connection(&app)?;
    let repo = SqliteNoteRepository::new(&conn);
    let (record, content_changed, affected_linked_note_ids) = NoteService::save_note(&repo, input)?;
    let note = record_to_loaded_note(record, &repo)?;
    if content_changed {
        sync_push(&app, SyncCommand::PushNote(note_id));
    }
    for linked_note_id in &affected_linked_note_ids {
        sync_push(&app, SyncCommand::PushNote(linked_note_id.clone()));
    }
    Ok(SaveNoteResponse {
        note,
        affected_linked_note_ids,
    })
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
pub fn search_note_titles(app: AppHandle, query: String) -> Result<Vec<SearchResult>, AppError> {
    let conn = database_connection(&app)?;
    let repo = SqliteNoteRepository::new(&conn);
    Ok(NoteService::search_note_titles(&repo, &query)?)
}

#[tauri::command]
pub fn search_tags(app: AppHandle, query: String) -> Result<Vec<String>, AppError> {
    let conn = database_connection(&app)?;
    let repo = SqliteNoteRepository::new(&conn);
    Ok(NoteService::search_tags(&repo, &query)?)
}

#[tauri::command]
pub fn get_note_backlinks(app: AppHandle, note_id: String) -> Result<Vec<NoteBacklink>, AppError> {
    let conn = database_connection(&app)?;
    let repo = SqliteNoteRepository::new(&conn);
    Ok(NoteService::backlinks_for_note(&repo, &note_id)?)
}

#[tauri::command]
pub fn resolve_wikilink(
    app: AppHandle,
    input: ResolveWikilinkInput,
) -> Result<Option<String>, AppError> {
    let conn = database_connection(&app)?;
    let repo = SqliteNoteRepository::new(&conn);
    Ok(NoteService::resolve_wikilink(&repo, input)?)
}

#[tauri::command]
pub fn export_notes(app: AppHandle, input: ExportNotesInput) -> Result<usize, AppError> {
    let conn = database_connection(&app)?;
    let repo = SqliteNoteRepository::new(&conn);
    Ok(NoteService::export_notes(&repo, input)?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::adapters::sqlite::migrations::account_migrations;
    use crate::domain::sync::conflict_store::store_note_conflict;
    use crate::domain::sync::model::SyncedNote;
    use crate::domain::sync::vector_clock::VectorClock;
    use rusqlite::Connection;

    fn setup_db() -> Connection {
        let mut conn = Connection::open_in_memory().unwrap();
        account_migrations().to_latest(&mut conn).unwrap();
        conn
    }

    #[test]
    fn load_conflict_snapshot_wikilink_resolutions_prefers_selected_conflict_snapshot() {
        let conn = setup_db();
        conn.execute(
            "INSERT INTO notes (id, title, markdown, created_at, modified_at, edited_at, locally_modified)
             VALUES ('note-1', 'Title', '# Title\n\n[[Alpha]]', 1, 1, 1, 1)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO note_wikilinks (source_note_id, occurrence_id, location, title, normalized_title, target_note_id, is_explicit)
             VALUES ('note-1', 'CURRENT1', 10, 'Alpha', 'alpha', 'current-target', 1)",
            [],
        )
        .unwrap();

        store_note_conflict(
            &conn,
            &SyncedNote {
                id: "note-1".to_string(),
                device_id: "DEVICE-B".to_string(),
                vector_clock: VectorClock::from([("DEVICE-B".to_string(), 1)]),
                title: "Title".to_string(),
                markdown: "# Title\n\n[[Alpha]]".to_string(),
                created_at: 1,
                modified_at: 2,
                edited_at: 2,
                archived_at: None,
                deleted_at: None,
                pinned_at: None,
                readonly: false,
                tags: vec![],
                wikilink_resolutions: vec![WikiLinkResolutionInput {
                    occurrence_id: Some("CONFLICT1".to_string()),
                    is_explicit: true,
                    location: 10,
                    title: "Alpha".to_string(),
                    target_note_id: "conflict-target".to_string(),
                }],
            },
            "evt-conflict",
        )
        .unwrap();

        let repo = SqliteNoteRepository::new(&conn);

        let conflict_resolutions = load_conflict_snapshot_wikilink_resolutions(
            &conn,
            &repo,
            "note-1",
            Some("evt-conflict"),
        )
        .unwrap();
        assert_eq!(conflict_resolutions.len(), 1);
        assert_eq!(conflict_resolutions[0].target_note_id, "conflict-target");

        let current_resolutions = load_conflict_snapshot_wikilink_resolutions(
            &conn,
            &repo,
            "note-1",
            Some("local:note-1"),
        )
        .unwrap();
        assert_eq!(current_resolutions.len(), 1);
        assert_eq!(current_resolutions[0].target_note_id, "current-target");
    }
}

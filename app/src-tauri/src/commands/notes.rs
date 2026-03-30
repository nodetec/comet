use crate::adapters::sqlite::note_repository::SqliteNoteRepository;
use crate::db::database_connection;
use crate::domain::common::text::preview_from_markdown;
use crate::domain::common::time::now_millis;
use crate::domain::notes::model::*;
use crate::domain::notes::service::NoteService;
use crate::domain::sync::model::SyncCommand;
use crate::error::AppError;
use crate::infra::cache::RenderedHtmlCache;
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

fn render_html(app: &AppHandle, note_id: &str, modified_at: i64, markdown: &str) -> String {
    let cache = app.state::<RenderedHtmlCache>();
    if let Some(html) = cache.get(note_id, modified_at) {
        return html;
    }
    let html = crate::adapters::markdown::renderer::markdown_to_lexical_html(markdown);
    cache.insert(note_id.to_string(), modified_at, html.clone());
    html
}

fn record_to_loaded_note(
    app: &AppHandle,
    record: NoteRecord,
    repo: &SqliteNoteRepository,
) -> Result<LoadedNote, AppError> {
    let tags = repo.tags_for_note(&record.id)?;
    let html = render_html(app, &record.id, record.modified_at, &record.markdown);
    Ok(LoadedNote {
        id: record.id,
        title: record.title,
        modified_at: record.modified_at,
        markdown: record.markdown,
        html,
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
    record_to_loaded_note(&app, record, &repo)
}

#[tauri::command]
pub async fn get_note_conflict(
    app: AppHandle,
    note_id: String,
) -> Result<Option<NoteConflictInfo>, AppError> {
    let conn = database_connection(&app)?;
    if !crate::adapters::tauri::key_store::is_current_identity_unlocked(&app, &conn)? {
        return Ok(None);
    }

    let current_note: Option<(Option<String>, String, String)> = conn
        .query_row(
            "SELECT current_rev, title, markdown FROM notes WHERE id = ?1",
            params![note_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .optional()?;

    let (keys, _) = crate::adapters::tauri::key_store::keys_for_current_identity(&app, &conn)?;
    let recipient = keys.public_key().to_hex();
    let document_coord =
        crate::domain::sync::revision_codec::compute_document_coord(keys.secret_key(), &note_id);
    let current_revision_id = current_note.as_ref().and_then(|(rev, _, _)| rev.clone());
    let relay_url = preferred_conflict_relay_url(&conn);
    let scope_heads = crate::adapters::sqlite::revision_sync_repository::list_sync_heads_for_scope(
        &conn,
        &recipient,
        &document_coord,
    )?;
    if scope_heads.len() <= 1 {
        return Ok(None);
    }

    let mut heads = scope_heads
        .into_iter()
        .map(|head| NoteConflictHead {
            revision_id: head.rev.clone(),
            mtime: head.mtime,
            op: head.op,
            title: None,
            markdown: None,
            preview: None,
            is_current: current_revision_id.as_deref() == Some(head.rev.as_str()),
            is_available: false,
        })
        .collect::<Vec<_>>();

    if let Some((Some(current_rev), title, markdown)) = current_note.as_ref() {
        if let Some(head) = heads
            .iter_mut()
            .find(|head| head.revision_id == *current_rev)
        {
            head.title = Some(title.clone());
            head.markdown = Some(markdown.clone());
            head.preview = Some(preview_from_markdown(markdown));
            head.is_available = true;
        }
    }

    if let Some(ref relay_url) = relay_url {
        let revision_ids = heads
            .iter()
            .map(|head| head.revision_id.clone())
            .collect::<Vec<_>>();

        if let Ok(mut connection) =
            crate::adapters::nostr::relay_client::RevisionRelayConnection::connect_authenticated(
                relay_url, &keys,
            )
            .await
        {
            if connection
                .send_req_revisions("conflict-inspect", &recipient, &revision_ids)
                .await
                .is_ok()
            {
                loop {
                    match connection.recv_message().await {
                        Ok(crate::adapters::nostr::relay_client::RevisionRelayIncomingMessage::Event {
                            subscription_id,
                            event,
                        }) if subscription_id == "conflict-inspect" => {
                            let meta =
                                crate::domain::sync::revision_codec::parse_revision_envelope_meta(
                                    &event,
                                )?;
                            let Some(head) = heads
                                .iter_mut()
                                .find(|head| head.revision_id == meta.revision_id)
                            else {
                                continue;
                            };

                            if meta.op == "del" {
                                head.title = head.title.clone().or_else(|| Some("Deleted".into()));
                                head.preview = Some("Deleted".into());
                                head.is_available = true;
                                continue;
                            }

                            let unwrapped =
                                crate::adapters::nostr::nip59_ext::extract_rumor(&keys, &event)?;
                            let note = crate::domain::sync::event_codec::rumor_to_synced_note(
                                &unwrapped.rumor,
                            )?;
                            head.title = Some(note.title.clone());
                            head.preview = Some(preview_from_markdown(&note.markdown));
                            head.markdown = Some(note.markdown);
                            head.is_available = true;
                        }
                        Ok(
                            crate::adapters::nostr::relay_client::RevisionRelayIncomingMessage::EventStatus {
                                subscription_id,
                                rev,
                                status,
                            },
                        ) if subscription_id == "conflict-inspect" => {
                            if status == "payload_compacted" {
                                if let Some(head) =
                                    heads.iter_mut().find(|head| head.revision_id == rev)
                                {
                                    head.preview =
                                        Some("Payload compacted on the relay".into());
                                }
                            }
                        }
                        Ok(
                            crate::adapters::nostr::relay_client::RevisionRelayIncomingMessage::Eose {
                                subscription_id,
                            },
                        ) if subscription_id == "conflict-inspect" => break,
                        Ok(_) => {}
                        Err(error) => {
                            eprintln!(
                                "[sync] conflict inspection failed note={} relay={}: {}",
                                note_id, relay_url, error
                            );
                            break;
                        }
                    }
                }
            }
        }
    }

    heads.sort_by(|left, right| {
        right
            .is_current
            .cmp(&left.is_current)
            .then_with(|| right.is_available.cmp(&left.is_available))
            .then_with(|| right.mtime.cmp(&left.mtime))
            .then_with(|| left.revision_id.cmp(&right.revision_id))
    });

    Ok(Some(NoteConflictInfo {
        note_id,
        current_revision_id,
        head_count: heads.len(),
        relay_url,
        heads,
    }))
}

#[tauri::command]
pub async fn resolve_note_conflict(
    app: AppHandle,
    note_id: String,
    delete_selected: Option<bool>,
) -> Result<(), AppError> {
    let conn = database_connection(&app)?;
    let (keys, _) = crate::adapters::tauri::key_store::keys_for_current_identity(&app, &conn)?;
    let recipient = keys.public_key().to_hex();
    let document_coord =
        crate::domain::sync::revision_codec::compute_document_coord(keys.secret_key(), &note_id);
    let heads = crate::adapters::sqlite::revision_sync_repository::list_sync_heads_for_scope(
        &conn,
        &recipient,
        &document_coord,
    )?;
    if heads.len() <= 1 {
        return Err(AppError::custom("Note is not conflicted."));
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

    if delete_selected.unwrap_or(false) {
        crate::adapters::nostr::revision_push::push_deletion_revision(
            &app,
            &active_relay_url,
            &backup_relay_urls,
            &keys,
            &note_id,
        )
        .await?;
    } else {
        crate::adapters::nostr::revision_push::push_note_revision(
            &app,
            &active_relay_url,
            &backup_relay_urls,
            &keys,
            &note_id,
        )
        .await?;
    }

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
    record_to_loaded_note(&app, record, &repo)
}

#[tauri::command]
pub fn duplicate_note(app: AppHandle, note_id: String) -> Result<LoadedNote, AppError> {
    let conn = database_connection(&app)?;
    let repo = SqliteNoteRepository::new(&conn);
    let record = NoteService::duplicate_note(&repo, &note_id)?;
    let note = record_to_loaded_note(&app, record, &repo)?;
    sync_push(&app, SyncCommand::PushNote(note.id.clone()));
    Ok(note)
}

#[tauri::command]
pub fn save_note(app: AppHandle, input: SaveNoteInput) -> Result<LoadedNote, AppError> {
    let note_id = input.id.clone();
    let conn = database_connection(&app)?;
    let repo = SqliteNoteRepository::new(&conn);
    let (record, content_changed) = NoteService::save_note(&repo, input)?;
    let note = record_to_loaded_note(&app, record, &repo)?;
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
    let note = record_to_loaded_note(&app, record, &repo)?;
    sync_push(&app, SyncCommand::PushNote(note_id));
    Ok(note)
}

#[tauri::command]
pub fn rename_tag(app: AppHandle, input: RenameTagInput) -> Result<Vec<String>, AppError> {
    let conn = database_connection(&app)?;
    let repo = SqliteNoteRepository::new(&conn);
    let affected_note_ids = NoteService::rename_tag(&repo, input)?;

    let cache = app.state::<RenderedHtmlCache>();
    for note_id in &affected_note_ids {
        cache.invalidate(note_id);
        sync_push(&app, SyncCommand::PushNote(note_id.clone()));
    }

    Ok(affected_note_ids)
}

#[tauri::command]
pub fn delete_tag(app: AppHandle, input: DeleteTagInput) -> Result<Vec<String>, AppError> {
    let conn = database_connection(&app)?;
    let repo = SqliteNoteRepository::new(&conn);
    let affected_note_ids = NoteService::delete_tag(&repo, input)?;

    let cache = app.state::<RenderedHtmlCache>();
    for note_id in &affected_note_ids {
        cache.invalidate(note_id);
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
    let note = record_to_loaded_note(&app, record, &repo)?;
    sync_push(&app, SyncCommand::PushNote(note_id));
    Ok(note)
}

#[tauri::command]
pub fn restore_note(app: AppHandle, note_id: String) -> Result<LoadedNote, AppError> {
    let conn = database_connection(&app)?;
    let repo = SqliteNoteRepository::new(&conn);
    let record = NoteService::restore_note(&repo, &note_id)?;
    let note = record_to_loaded_note(&app, record, &repo)?;
    sync_push(&app, SyncCommand::PushNote(note_id));
    Ok(note)
}

#[tauri::command]
pub fn trash_note(app: AppHandle, note_id: String) -> Result<LoadedNote, AppError> {
    let conn = database_connection(&app)?;
    let repo = SqliteNoteRepository::new(&conn);
    let record = NoteService::trash_note(&repo, &note_id)?;
    let note = record_to_loaded_note(&app, record, &repo)?;
    sync_push(&app, SyncCommand::PushNote(note_id));
    Ok(note)
}

#[tauri::command]
pub fn restore_from_trash(app: AppHandle, note_id: String) -> Result<LoadedNote, AppError> {
    let conn = database_connection(&app)?;
    let repo = SqliteNoteRepository::new(&conn);
    let record = NoteService::restore_from_trash(&repo, &note_id)?;
    let note = record_to_loaded_note(&app, record, &repo)?;
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
    NoteService::delete_permanently(&repo, &note_id)?;

    // Blob cleanup (needs AppHandle).
    let blossom_deletions =
        crate::domain::blob::service::cleanup_orphaned_blobs(&app, &conn, &orphaned);
    spawn_blossom_deletions(&app, blossom_deletions);

    // Invalidate cached HTML.
    let cache = app.state::<RenderedHtmlCache>();
    cache.invalidate(&note_id);

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

    let note_ids = NoteService::empty_trash(&repo)?;

    // Blob cleanup.
    let blossom_deletions =
        crate::domain::blob::service::cleanup_orphaned_blobs(&app, &conn, &orphaned);
    spawn_blossom_deletions(&app, blossom_deletions);

    // Invalidate cached HTML and record pending deletions.
    let cache = app.state::<RenderedHtmlCache>();
    for note_id in &note_ids {
        cache.invalidate(note_id);
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
    let note = record_to_loaded_note(&app, record, &repo)?;
    sync_push(&app, SyncCommand::PushNote(note_id));
    Ok(note)
}

#[tauri::command]
pub fn unpin_note(app: AppHandle, note_id: String) -> Result<LoadedNote, AppError> {
    let conn = database_connection(&app)?;
    let repo = SqliteNoteRepository::new(&conn);
    let record = NoteService::unpin_note(&repo, &note_id)?;
    let note = record_to_loaded_note(&app, record, &repo)?;
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

use crate::db::database_connection;
use crate::domain::relay::service::normalize_relay_url;
use crate::error::AppError;
use rusqlite::Connection;
use rusqlite::OptionalExtension;
use serde::Serialize;
use tauri::{AppHandle, Manager};

fn restart_sync_async(app: &AppHandle) {
    let app_clone = app.clone();
    tauri::async_runtime::spawn(async move {
        let _ = crate::adapters::nostr::sync_manager::start_if_ready(&app_clone).await;
    });
}

fn clear_local_sync_state(conn: &Connection) -> Result<(), AppError> {
    crate::adapters::sqlite::tag_index::clear_tag_index(conn)?;
    conn.execute_batch(
        "DELETE FROM notes_fts;
         DELETE FROM note_conflicts;
         DELETE FROM note_tombstones;
         DELETE FROM notes;
         DELETE FROM blob_meta;
         DELETE FROM blob_uploads;
         DELETE FROM pending_blob_uploads;
         DELETE FROM pending_deletions;
         DELETE FROM sync_snapshots;
         DELETE FROM sync_relay_state;
         DELETE FROM sync_relays;
         DELETE FROM app_settings WHERE key IN ('active_sync_relay_url');",
    )?;
    Ok(())
}

#[tauri::command]
pub fn list_relays(app: AppHandle) -> Result<Vec<crate::domain::relay::model::Relay>, AppError> {
    let conn = database_connection(&app)?;
    crate::adapters::sqlite::relay_repository::list_relays(&conn)
}

#[tauri::command]
pub fn set_sync_relay(
    app: AppHandle,
    url: String,
) -> Result<Vec<crate::domain::relay::model::Relay>, AppError> {
    let conn = database_connection(&app)?;
    let normalized_url = normalize_relay_url(&url)?;
    let relays = crate::adapters::sqlite::relay_repository::set_sync_relay(&conn, &normalized_url)?;
    if crate::adapters::sqlite::sync_repository::get_preferred_sync_relay_url(&conn).is_none() {
        crate::adapters::sqlite::sync_repository::save_preferred_sync_relay_url(
            &conn,
            &normalized_url,
        )?;
    }
    restart_sync_async(&app);
    Ok(relays)
}

#[tauri::command]
pub fn remove_sync_relay(
    app: AppHandle,
    url: Option<String>,
) -> Result<Vec<crate::domain::relay::model::Relay>, AppError> {
    let conn = database_connection(&app)?;
    let active_relay_url =
        crate::adapters::sqlite::sync_repository::get_active_sync_relay_url(&conn);
    let relays =
        crate::adapters::sqlite::relay_repository::remove_sync_relay(&conn, url.as_deref())?;
    if let Some(removed_url) = url.as_deref().map(normalize_relay_url).transpose()? {
        let _ =
            crate::adapters::sqlite::sync_repository::clear_paused_sync_relay(&conn, &removed_url);
        if crate::adapters::sqlite::sync_repository::get_preferred_sync_relay_url(&conn).as_deref()
            == Some(removed_url.as_str())
        {
            let fallback = crate::adapters::sqlite::sync_repository::list_sync_relay_urls(&conn)
                .into_iter()
                .next();
            if let Some(next_url) = fallback {
                crate::adapters::sqlite::sync_repository::save_preferred_sync_relay_url(
                    &conn, &next_url,
                )?;
            } else {
                crate::adapters::sqlite::sync_repository::clear_preferred_sync_relay_url(&conn);
            }
        }
    } else {
        crate::adapters::sqlite::sync_repository::clear_paused_sync_relay_urls(&conn);
        crate::adapters::sqlite::sync_repository::clear_preferred_sync_relay_url(&conn);
    }
    if url
        .as_ref()
        .zip(active_relay_url.as_ref())
        .is_some_and(|(removed, active)| removed == active)
    {
        crate::adapters::sqlite::sync_repository::clear_active_sync_relay_url(&conn);
    }
    let remaining_sync_relays =
        crate::adapters::sqlite::sync_repository::list_sync_relay_urls(&conn);
    if remaining_sync_relays.is_empty() {
        crate::adapters::sqlite::sync_repository::clear_active_sync_relay_url(&conn);
        let app_clone = app.clone();
        tauri::async_runtime::spawn(async move {
            app_clone
                .state::<crate::adapters::nostr::sync_manager::SyncManager>()
                .stop()
                .await;
        });
    } else {
        restart_sync_async(&app);
    }
    Ok(relays)
}

#[tauri::command]
pub fn set_preferred_sync_relay(
    app: AppHandle,
    url: String,
) -> Result<Vec<crate::domain::relay::model::Relay>, AppError> {
    let conn = database_connection(&app)?;
    let url = normalize_relay_url(&url)?;
    let configured_relays = crate::adapters::sqlite::sync_repository::list_sync_relay_urls(&conn);
    if !configured_relays
        .iter()
        .any(|configured| configured == &url)
    {
        return Err(AppError::custom(format!(
            "Sync relay is not configured: {url}"
        )));
    }

    crate::adapters::sqlite::sync_repository::save_preferred_sync_relay_url(&conn, &url)?;
    let relays = crate::adapters::sqlite::relay_repository::list_relays(&conn)?;
    restart_sync_async(&app);
    Ok(relays)
}

#[tauri::command]
pub fn pause_sync_relay(
    app: AppHandle,
    url: String,
    paused: bool,
) -> Result<Vec<crate::domain::relay::model::Relay>, AppError> {
    let conn = database_connection(&app)?;
    let url = normalize_relay_url(&url)?;
    let configured_relays = crate::adapters::sqlite::sync_repository::list_sync_relay_urls(&conn);
    if !configured_relays
        .iter()
        .any(|configured| configured == &url)
    {
        return Err(AppError::custom(format!(
            "Sync relay is not configured: {url}"
        )));
    }

    crate::adapters::sqlite::sync_repository::set_sync_relay_paused(&conn, &url, paused)?;
    if paused
        && crate::adapters::sqlite::sync_repository::get_active_sync_relay_url(&conn).as_deref()
            == Some(url.as_str())
    {
        crate::adapters::sqlite::sync_repository::clear_active_sync_relay_url(&conn);
    }

    let relays = crate::adapters::sqlite::relay_repository::list_relays(&conn)?;
    restart_sync_async(&app);
    Ok(relays)
}

#[tauri::command]
pub fn add_publish_relay(
    app: AppHandle,
    url: String,
) -> Result<Vec<crate::domain::relay::model::Relay>, AppError> {
    let conn = database_connection(&app)?;
    crate::adapters::sqlite::relay_repository::add_publish_relay(&conn, &url)
}

#[tauri::command]
pub fn remove_relay(
    app: AppHandle,
    url: String,
    kind: String,
) -> Result<Vec<crate::domain::relay::model::Relay>, AppError> {
    let conn = database_connection(&app)?;
    crate::adapters::sqlite::relay_repository::remove_relay(&conn, &url, &kind)
}

#[tauri::command]
pub async fn publish_note(
    app: AppHandle,
    input: crate::domain::relay::model::PublishNoteInput,
) -> Result<crate::domain::relay::model::PublishResult, AppError> {
    crate::adapters::nostr::protocol::publish_note(&app, input).await
}

#[tauri::command]
pub async fn publish_short_note(
    app: AppHandle,
    input: crate::domain::relay::model::PublishShortNoteInput,
) -> Result<crate::domain::relay::model::PublishResult, AppError> {
    crate::adapters::nostr::protocol::publish_short_note(&app, input).await
}

#[tauri::command]
pub async fn delete_published_note(
    app: AppHandle,
    note_id: String,
) -> Result<crate::domain::relay::model::PublishResult, AppError> {
    crate::adapters::nostr::protocol::delete_published_note(&app, &note_id).await
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncInfo {
    state: crate::domain::sync::model::SyncState,
    relay_url: Option<String>,
    relay_urls: Vec<String>,
    active_relay_url: Option<String>,
    preferred_relay_url: Option<String>,
    blossom_url: Option<String>,
    npub: Option<String>,
    snapshot_managed_notes: i64,
    relay_backed_notes: i64,
    pending_changes: i64,
    total_notes: i64,
    checkpoint_seq: Option<i64>,
    blobs_stored: i64,
    failed_blob_uploads: i64,
}

#[tauri::command]
pub async fn get_sync_info(app: AppHandle) -> Result<SyncInfo, AppError> {
    let manager = app.state::<crate::adapters::nostr::sync_manager::SyncManager>();
    let state = manager.state().await;

    let conn = database_connection(&app)?;

    let relay_urls = crate::adapters::sqlite::sync_repository::list_sync_relay_urls(&conn);
    let active_relay_url =
        crate::adapters::sqlite::sync_repository::get_active_sync_relay_url(&conn)
            .filter(|url| relay_urls.contains(url));
    let preferred_relay_url =
        crate::adapters::sqlite::sync_repository::get_preferred_sync_relay_url(&conn)
            .filter(|url| relay_urls.contains(url));
    let relay_url = active_relay_url
        .clone()
        .or_else(|| relay_urls.first().cloned());
    let blossom_url = crate::adapters::sqlite::sync_repository::get_blossom_url(&conn);
    let npub: Option<String> = conn
        .query_row("SELECT npub FROM nostr_identity LIMIT 1", [], |row| {
            row.get(0)
        })
        .optional()?;

    let snapshot_managed_notes: i64 = conn.query_row(
        "SELECT COUNT(*) FROM notes WHERE sync_event_id IS NOT NULL AND deleted_at IS NULL",
        [],
        |row| row.get(0),
    )?;
    let relay_backed_notes: i64 = conn.query_row(
        "SELECT COUNT(*) FROM notes WHERE sync_event_id IS NOT NULL AND deleted_at IS NULL",
        [],
        |row| row.get(0),
    )?;

    let total_notes: i64 = conn.query_row(
        "SELECT COUNT(*) FROM notes WHERE deleted_at IS NULL",
        [],
        |row| row.get(0),
    )?;

    let pending_changes: i64 = conn.query_row(
        "SELECT
            (SELECT COUNT(*) FROM notes WHERE locally_modified = 1) +
            (SELECT COUNT(*) FROM pending_deletions)",
        [],
        |row| row.get(0),
    )?;

    let checkpoint_seq = relay_url
        .as_deref()
        .map(|relay_url| {
            crate::adapters::sqlite::snapshot_sync_repository::get_sync_relay_state(
                &conn, relay_url,
            )
        })
        .transpose()?
        .flatten()
        .and_then(|state| state.checkpoint_seq);

    let blobs_stored: i64 =
        conn.query_row("SELECT COUNT(*) FROM blob_meta", [], |row| row.get(0))?;
    let failed_blob_uploads: i64 = conn.query_row(
        "SELECT COUNT(*) FROM pending_blob_uploads WHERE last_error IS NOT NULL",
        [],
        |row| row.get(0),
    )?;

    Ok(SyncInfo {
        state,
        relay_url,
        relay_urls,
        active_relay_url,
        preferred_relay_url,
        blossom_url,
        npub,
        snapshot_managed_notes,
        relay_backed_notes,
        pending_changes,
        total_notes,
        checkpoint_seq,
        blobs_stored,
        failed_blob_uploads,
    })
}

#[tauri::command]
pub fn is_sync_enabled(app: AppHandle) -> Result<bool, AppError> {
    let conn = database_connection(&app)?;
    let val: Option<String> = conn
        .query_row(
            "SELECT value FROM app_settings WHERE key = 'sync_enabled'",
            [],
            |row| row.get(0),
        )
        .optional()?;
    Ok(val.as_deref() == Some("true"))
}

#[tauri::command]
pub async fn set_sync_enabled(app: AppHandle, enabled: bool) -> Result<(), AppError> {
    let conn = database_connection(&app)?;
    if enabled {
        let uses_keychain_storage =
            crate::adapters::sqlite::identity_repository::get_nsec_storage(&conn)?.as_deref()
                == Some(crate::adapters::sqlite::identity_repository::NSEC_STORAGE_KEYCHAIN);

        if uses_keychain_storage {
            let _ = crate::adapters::tauri::key_store::keys_for_current_identity(&app, &conn)?;
        }
    }

    conn.execute(
        "INSERT OR REPLACE INTO app_settings (key, value) VALUES ('sync_enabled', ?1)",
        rusqlite::params![if enabled { "true" } else { "false" }],
    )?;
    drop(conn);

    let manager = app.state::<crate::adapters::nostr::sync_manager::SyncManager>();
    if enabled {
        crate::adapters::nostr::sync_manager::start_if_ready(&app).await?;
    } else {
        manager.stop().await;
    }
    Ok(())
}

#[tauri::command]
pub async fn get_sync_status(
    app: AppHandle,
) -> Result<crate::domain::sync::model::SyncState, AppError> {
    let manager = app.state::<crate::adapters::nostr::sync_manager::SyncManager>();
    Ok(manager.state().await)
}

#[tauri::command]
pub async fn resync(app: AppHandle) -> Result<(), AppError> {
    let manager = app.state::<crate::adapters::nostr::sync_manager::SyncManager>();
    manager.stop().await;

    let conn = database_connection(&app)?;
    clear_local_sync_state(&conn)?;

    crate::adapters::nostr::sync_manager::start_if_ready(&app).await?;
    Ok(())
}

#[tauri::command]
pub async fn restart_sync(app: AppHandle) -> Result<(), AppError> {
    crate::adapters::nostr::sync_manager::start_if_ready(&app).await?;
    Ok(())
}

#[tauri::command]
pub async fn unlock_current_account(app: AppHandle) -> Result<(), AppError> {
    let conn = database_connection(&app)?;
    let _ = crate::adapters::tauri::key_store::keys_for_current_identity(&app, &conn)?;
    drop(conn);
    crate::adapters::nostr::sync_manager::start_if_ready(&app).await?;
    Ok(())
}

#[tauri::command]
pub async fn unlock_sync(app: AppHandle) -> Result<(), AppError> {
    unlock_current_account(app).await
}

#[cfg(test)]
mod tests {
    use super::clear_local_sync_state;
    use crate::adapters::sqlite::migrations::account_migrations;
    use rusqlite::{Connection, OptionalExtension};

    #[test]
    fn clear_local_sync_state_wipes_sync_state_and_blob_bookkeeping() {
        let mut conn = Connection::open_in_memory().unwrap();
        account_migrations().to_latest(&mut conn).unwrap();

        conn.execute_batch(
            "INSERT INTO relays (url, kind, created_at)
                 VALUES ('wss://relay.example', 'sync', 1);
             INSERT INTO sync_relays (relay_url, created_at)
                 VALUES ('wss://relay.example', 1);
             INSERT INTO sync_relay_state (relay_url, checkpoint_seq, snapshot_seq, last_synced_at, min_payload_mtime, updated_at)
                 VALUES ('wss://relay.example', 10, 20, 30, 40, 50);
             INSERT INTO notes (id, title, markdown, created_at, modified_at, edited_at, sync_event_id, locally_modified)
                 VALUES ('note-1', 'Title', '# Title', 1, 2, 2, 'event-1', 1);
             INSERT INTO notes_fts (note_id, title, markdown)
                 VALUES ('note-1', 'Title', '# Title');
             INSERT INTO blob_meta (plaintext_hash, server_url, pubkey, ciphertext_hash, encryption_key)
                 VALUES ('plain-1', 'https://blobs.example.com', 'pubkey-1', 'cipher-1', 'key-1');
             INSERT INTO blob_uploads (object_hash, server_url, encrypted, size_bytes, uploaded_at)
                 VALUES ('cipher-1', 'https://blobs.example.com', 1, 123, 1);
             INSERT INTO pending_blob_uploads (plaintext_hash, server_url, pubkey, ciphertext_hash, encryption_key, ciphertext, content_type, size_bytes, created_at, updated_at)
                 VALUES ('plain-1', 'https://blobs.example.com', 'pubkey-1', 'cipher-1', 'key-1', X'01', 'image/png', 123, 1, 1);
             INSERT INTO pending_deletions (entity_id, created_at)
                 VALUES ('note-1', 1);
             INSERT INTO sync_snapshots (author_pubkey, d_tag, snapshot_id, op, mtime, entity_type, event_id, relay_url, stored_seq, created_at)
                 VALUES ('author-1', 'doc-1', 'snapshot-1', 'put', 2, 'note', 'event-1', 'wss://relay.example', 10, 1);
             INSERT INTO tags (id, path, parent_id, last_segment, depth, pinned, hide_subtag_notes, icon, created_at, updated_at)
                 VALUES (1, 'alpha', NULL, 'alpha', 0, 0, 0, NULL, 1, 1);
             INSERT INTO note_tag_links (note_id, tag_id, is_direct)
                 VALUES ('note-1', 1, 1);
             INSERT INTO app_settings (key, value)
                 VALUES ('active_sync_relay_url', 'wss://relay.example');",
        )
        .unwrap();

        clear_local_sync_state(&conn).unwrap();

        let notes: i64 = conn
            .query_row("SELECT COUNT(*) FROM notes", [], |row| row.get(0))
            .unwrap();
        let notes_fts: i64 = conn
            .query_row("SELECT COUNT(*) FROM notes_fts", [], |row| row.get(0))
            .unwrap();
        let blob_meta: i64 = conn
            .query_row("SELECT COUNT(*) FROM blob_meta", [], |row| row.get(0))
            .unwrap();
        let blob_uploads: i64 = conn
            .query_row("SELECT COUNT(*) FROM blob_uploads", [], |row| row.get(0))
            .unwrap();
        let pending_blob_uploads: i64 = conn
            .query_row("SELECT COUNT(*) FROM pending_blob_uploads", [], |row| {
                row.get(0)
            })
            .unwrap();
        let pending_deletions: i64 = conn
            .query_row("SELECT COUNT(*) FROM pending_deletions", [], |row| {
                row.get(0)
            })
            .unwrap();
        let sync_snapshots: i64 = conn
            .query_row("SELECT COUNT(*) FROM sync_snapshots", [], |row| row.get(0))
            .unwrap();
        let sync_relay_state: i64 = conn
            .query_row("SELECT COUNT(*) FROM sync_relay_state", [], |row| {
                row.get(0)
            })
            .unwrap();
        let sync_relays: i64 = conn
            .query_row("SELECT COUNT(*) FROM sync_relays", [], |row| row.get(0))
            .unwrap();
        let relays: i64 = conn
            .query_row("SELECT COUNT(*) FROM relays", [], |row| row.get(0))
            .unwrap();
        let tags: i64 = conn
            .query_row("SELECT COUNT(*) FROM tags", [], |row| row.get(0))
            .unwrap();
        let note_tag_links: i64 = conn
            .query_row("SELECT COUNT(*) FROM note_tag_links", [], |row| row.get(0))
            .unwrap();
        let active_sync_relay_url: Option<String> = conn
            .query_row(
                "SELECT value FROM app_settings WHERE key = 'active_sync_relay_url'",
                [],
                |row| row.get(0),
            )
            .optional()
            .unwrap();

        assert_eq!(notes, 0);
        assert_eq!(notes_fts, 0);
        assert_eq!(blob_meta, 0);
        assert_eq!(blob_uploads, 0);
        assert_eq!(pending_blob_uploads, 0);
        assert_eq!(pending_deletions, 0);
        assert_eq!(sync_snapshots, 0);
        assert_eq!(sync_relay_state, 0);
        assert_eq!(sync_relays, 0);
        assert_eq!(tags, 0);
        assert_eq!(note_tag_links, 0);
        assert_eq!(active_sync_relay_url, None);
        assert_eq!(relays, 1);
    }
}

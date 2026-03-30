use crate::db::database_connection;
use crate::domain::relay::service::normalize_relay_url;
use crate::error::AppError;
use rusqlite::OptionalExtension;
use serde::Serialize;
use tauri::{AppHandle, Manager};

fn restart_sync_async(app: &AppHandle) {
    let app_clone = app.clone();
    tauri::async_runtime::spawn(async move {
        let _ = crate::adapters::nostr::sync_manager::start_if_ready(&app_clone).await;
    });
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
    revision_managed_notes: i64,
    relay_backed_notes: i64,
    pending_changes: i64,
    total_notes: i64,
    checkpoint_seq: Option<i64>,
    blobs_stored: i64,
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

    let revision_managed_notes: i64 = conn.query_row(
        "SELECT COUNT(*) FROM notes WHERE current_rev IS NOT NULL AND deleted_at IS NULL",
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
            crate::adapters::sqlite::revision_sync_repository::get_sync_relay_state(
                &conn, relay_url,
            )
        })
        .transpose()?
        .flatten()
        .and_then(|state| state.checkpoint_seq);

    let blobs_stored: i64 =
        conn.query_row("SELECT COUNT(*) FROM blob_meta", [], |row| row.get(0))?;

    Ok(SyncInfo {
        state,
        relay_url,
        relay_urls,
        active_relay_url,
        preferred_relay_url,
        blossom_url,
        npub,
        revision_managed_notes,
        relay_backed_notes,
        pending_changes,
        total_notes,
        checkpoint_seq,
        blobs_stored,
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
    crate::adapters::sqlite::tag_index::clear_tag_index(&conn)?;
    conn.execute_batch(
        "DELETE FROM notes_fts;
         DELETE FROM notes;
         DELETE FROM blob_meta;
         DELETE FROM pending_deletions;
         DELETE FROM app_settings WHERE key IN ('active_sync_relay_url');",
    )?;

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

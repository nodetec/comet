use crate::db::database_connection;
use crate::error::AppError;
use rusqlite::OptionalExtension;
use serde::Serialize;
use tauri::{AppHandle, Manager};

fn reset_sync_state(conn: &rusqlite::Connection) -> Result<(), AppError> {
    conn.execute_batch("BEGIN")?;
    let result = (|| -> Result<(), AppError> {
        conn.execute(
            "UPDATE notes SET sync_event_id = NULL, locally_modified = 1",
            [],
        )?;
        conn.execute(
            "UPDATE notebooks SET sync_event_id = NULL, locally_modified = 1",
            [],
        )?;
        conn.execute("DELETE FROM app_settings WHERE key = 'sync_checkpoint'", [])?;
        conn.execute("DELETE FROM app_settings WHERE key = 'sync_relay_url'", [])?;
        conn.execute("DELETE FROM pending_deletions", [])?;
        Ok(())
    })();
    if result.is_ok() {
        conn.execute_batch("COMMIT")?;
    } else {
        let _ = conn.execute_batch("ROLLBACK");
    }
    result
}

fn restart_sync_async(app: &AppHandle) {
    let app_clone = app.clone();
    tauri::async_runtime::spawn(async move {
        let _ = crate::sync::start_if_ready(&app_clone).await;
    });
}

#[tauri::command]
pub fn list_relays(app: AppHandle) -> Result<Vec<crate::nostr::Relay>, AppError> {
    let conn = database_connection(&app)?;
    crate::nostr::list_relays(&conn)
}

#[tauri::command]
pub fn set_sync_relay(app: AppHandle, url: String) -> Result<Vec<crate::nostr::Relay>, AppError> {
    let conn = database_connection(&app)?;
    let relays = crate::nostr::set_sync_relay(&conn, &url)?;
    reset_sync_state(&conn)?;
    restart_sync_async(&app);
    Ok(relays)
}

#[tauri::command]
pub fn remove_sync_relay(app: AppHandle) -> Result<Vec<crate::nostr::Relay>, AppError> {
    let conn = database_connection(&app)?;
    let relays = crate::nostr::remove_sync_relay(&conn)?;
    let app_clone = app.clone();
    tauri::async_runtime::spawn(async move {
        app_clone
            .state::<crate::sync::SyncManager>()
            .stop()
            .await;
    });
    Ok(relays)
}

#[tauri::command]
pub fn add_publish_relay(
    app: AppHandle,
    url: String,
) -> Result<Vec<crate::nostr::Relay>, AppError> {
    let conn = database_connection(&app)?;
    crate::nostr::add_publish_relay(&conn, &url)
}

#[tauri::command]
pub fn remove_relay(
    app: AppHandle,
    url: String,
    kind: String,
) -> Result<Vec<crate::nostr::Relay>, AppError> {
    let conn = database_connection(&app)?;
    crate::nostr::remove_relay(&conn, &url, &kind)
}

#[tauri::command]
pub async fn publish_note(
    app: AppHandle,
    input: crate::nostr::PublishNoteInput,
) -> Result<crate::nostr::PublishResult, AppError> {
    crate::nostr::publish_note(&app, input).await
}

#[tauri::command]
pub async fn publish_short_note(
    app: AppHandle,
    input: crate::nostr::PublishShortNoteInput,
) -> Result<crate::nostr::PublishResult, AppError> {
    crate::nostr::publish_short_note(&app, input).await
}

#[tauri::command]
pub async fn delete_published_note(
    app: AppHandle,
    note_id: String,
) -> Result<crate::nostr::PublishResult, AppError> {
    crate::nostr::delete_published_note(&app, &note_id).await
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncInfo {
    state: crate::sync::SyncState,
    relay_url: Option<String>,
    blossom_url: Option<String>,
    npub: Option<String>,
    synced_notes: i64,
    synced_notebooks: i64,
    pending_notes: i64,
    pending_notebooks: i64,
    total_notes: i64,
    checkpoint: i64,
    blobs_stored: i64,
}

#[tauri::command]
pub async fn get_sync_info(app: AppHandle) -> Result<SyncInfo, AppError> {
    let manager = app.state::<crate::sync::SyncManager>();
    let state = manager.state().await;

    let conn = database_connection(&app)?;

    let relay_url = crate::sync::get_sync_relay_url(&conn);
    let blossom_url = crate::sync::get_blossom_url(&conn);
    let npub: Option<String> = conn
        .query_row("SELECT npub FROM nostr_identity LIMIT 1", [], |row| {
            row.get(0)
        })
        .optional()?;

    let synced_notes: i64 = conn.query_row(
        "SELECT COUNT(*) FROM notes WHERE sync_event_id IS NOT NULL AND archived_at IS NULL",
        [],
        |row| row.get(0),
    )?;

    let total_notes: i64 = conn.query_row(
        "SELECT COUNT(*) FROM notes WHERE archived_at IS NULL",
        [],
        |row| row.get(0),
    )?;

    let synced_notebooks: i64 = conn.query_row(
        "SELECT COUNT(*) FROM notebooks WHERE sync_event_id IS NOT NULL",
        [],
        |row| row.get(0),
    )?;

    let pending_notes: i64 = conn.query_row(
        "SELECT COUNT(*) FROM notes WHERE locally_modified = 1",
        [],
        |row| row.get(0),
    )?;

    let pending_notebooks: i64 = conn.query_row(
        "SELECT COUNT(*) FROM notebooks WHERE locally_modified = 1",
        [],
        |row| row.get(0),
    )?;

    let checkpoint: i64 = crate::sync::get_checkpoint(&conn);

    let blobs_stored: i64 =
        conn.query_row("SELECT COUNT(*) FROM blob_meta", [], |row| row.get(0))?;

    Ok(SyncInfo {
        state,
        relay_url,
        blossom_url,
        npub,
        synced_notes,
        synced_notebooks,
        pending_notes,
        pending_notebooks,
        total_notes,
        checkpoint,
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
    conn.execute(
        "INSERT OR REPLACE INTO app_settings (key, value) VALUES ('sync_enabled', ?1)",
        rusqlite::params![if enabled { "true" } else { "false" }],
    )?;
    drop(conn);

    let manager = app.state::<crate::sync::SyncManager>();
    if enabled {
        crate::sync::start_if_ready(&app).await?;
    } else {
        manager.stop().await;
    }
    Ok(())
}

#[tauri::command]
pub async fn get_sync_status(app: AppHandle) -> Result<crate::sync::SyncState, AppError> {
    let manager = app.state::<crate::sync::SyncManager>();
    Ok(manager.state().await)
}

#[tauri::command]
pub async fn resync(app: AppHandle) -> Result<(), AppError> {
    let manager = app.state::<crate::sync::SyncManager>();
    manager.stop().await;

    let conn = database_connection(&app)?;
    conn.execute_batch(
        "DELETE FROM notes_fts;
         DELETE FROM note_tags;
         DELETE FROM notes;
         DELETE FROM notebooks;
         DELETE FROM blob_meta;
         DELETE FROM pending_deletions;
         DELETE FROM app_settings WHERE key = 'sync_checkpoint';",
    )?;

    crate::sync::start_if_ready(&app).await?;
    Ok(())
}

#[tauri::command]
pub async fn restart_sync(app: AppHandle) -> Result<(), AppError> {
    crate::sync::start_if_ready(&app).await?;
    Ok(())
}

#[tauri::command]
pub async fn unlock_current_account(app: AppHandle) -> Result<(), AppError> {
    let conn = database_connection(&app)?;
    let _ = crate::secure_storage::keys_for_current_identity(&app, &conn)?;
    drop(conn);
    crate::sync::start_if_ready(&app).await?;
    Ok(())
}

#[tauri::command]
pub async fn unlock_sync(app: AppHandle) -> Result<(), AppError> {
    unlock_current_account(app).await
}

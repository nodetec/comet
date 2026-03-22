mod adapters;
mod attachments;
mod blossom;
mod commands;
mod db;
mod domain;
mod error;
mod infra;
mod markdown;
mod nip44_ext;
mod nip59_ext;
mod nostr;
mod notes;
mod ports;
mod secure_storage;
mod sync;
mod themes;

use db::{
    active_account, active_account_attachments_dir, active_account_dir, app_database_path,
    database_connection,
};
use error::AppError;
use rusqlite::OptionalExtension;
use serde::Serialize;
use tauri::{AppHandle, Manager, RunEvent, WindowEvent};
use tauri_plugin_log::{RotationStrategy, Target, TargetKind, TimezoneStrategy};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AppStatus {
    version: String,
    app_database_path: String,
    account_path: String,
    database_path: String,
    attachments_path: String,
    themes_path: String,
    active_npub: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
enum BlobFetchStatus {
    Downloaded,
    Missing,
    NeedsUnlock,
}

#[tauri::command]
fn app_status(app: AppHandle) -> Result<AppStatus, AppError> {
    let config_dir = app.path().app_config_dir()?;
    let app_database_path = app_database_path(&app)?;
    let account = active_account(&app)?;
    let account_path = active_account_dir(&app)?;
    let attachments_path = active_account_attachments_dir(&app)?;
    let themes_path = config_dir.join("themes");

    Ok(AppStatus {
        version: app
            .config()
            .version
            .clone()
            .unwrap_or_else(|| "unknown".into()),
        app_database_path: app_database_path.to_string_lossy().into_owned(),
        account_path: account_path.to_string_lossy().into_owned(),
        database_path: account.db_path.to_string_lossy().into_owned(),
        attachments_path: attachments_path.to_string_lossy().into_owned(),
        themes_path: themes_path.to_string_lossy().into_owned(),
        active_npub: account.npub,
    })
}

#[tauri::command]
fn list_themes(app: AppHandle) -> Result<Vec<themes::ThemeSummary>, AppError> {
    themes::list_themes(&app)
}

#[tauri::command]
fn read_theme(app: AppHandle, theme_id: String) -> Result<themes::ThemeData, AppError> {
    themes::read_theme(&app, &theme_id)
}

#[tauri::command]
fn reveal_main_window(app: AppHandle) -> Result<(), AppError> {
    #[cfg(target_os = "macos")]
    app.show()?;

    let window = app
        .get_webview_window("main")
        .ok_or_else(|| AppError::custom("Main window not found."))?;

    window.show()?;
    window.set_focus()?;
    Ok(())
}

#[tauri::command]
fn get_attachments_dir(app: AppHandle) -> Result<String, AppError> {
    attachments::get_attachments_dir(&app)
}

#[tauri::command]
fn import_image(
    app: AppHandle,
    source_path: String,
) -> Result<attachments::ImportedImage, AppError> {
    attachments::import_image(&app, &source_path)
}

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
        let _ = sync::start_if_ready(&app_clone).await;
    });
}


#[tauri::command]
fn list_relays(app: AppHandle) -> Result<Vec<nostr::Relay>, AppError> {
    let conn = database_connection(&app)?;
    nostr::list_relays(&conn)
}

#[tauri::command]
fn set_sync_relay(app: AppHandle, url: String) -> Result<Vec<nostr::Relay>, AppError> {
    let conn = database_connection(&app)?;
    let relays = nostr::set_sync_relay(&conn, &url)?;
    reset_sync_state(&conn)?;
    restart_sync_async(&app);
    Ok(relays)
}

#[tauri::command]
fn remove_sync_relay(app: AppHandle) -> Result<Vec<nostr::Relay>, AppError> {
    let conn = database_connection(&app)?;
    let relays = nostr::remove_sync_relay(&conn)?;
    let app_clone = app.clone();
    tauri::async_runtime::spawn(async move {
        app_clone.state::<sync::SyncManager>().stop().await;
    });
    Ok(relays)
}

#[tauri::command]
fn get_blossom_url(app: AppHandle) -> Result<Option<String>, AppError> {
    let conn = database_connection(&app)?;
    Ok(sync::get_blossom_url(&conn))
}

#[tauri::command]
fn set_blossom_url(app: AppHandle, url: String) -> Result<(), AppError> {
    let parsed =
        url::Url::parse(url.trim()).map_err(|_| AppError::custom("Invalid Blossom URL"))?;
    match parsed.scheme() {
        "https" | "http" => {}
        _ => {
            return Err(AppError::custom(
                "Blossom URL must start with https:// or http://",
            ))
        }
    }
    let url = parsed.as_str().trim_end_matches('/').to_string();
    let conn = database_connection(&app)?;
    conn.execute(
        "INSERT OR REPLACE INTO app_settings (key, value) VALUES ('blossom_url', ?1)",
        rusqlite::params![url],
    )?;
    Ok(())
}

#[tauri::command]
async fn fetch_blob(app: AppHandle, hash: String) -> Result<BlobFetchStatus, AppError> {
    log::info!("[blob] fetch requested plaintext_hash={hash}");

    if crate::attachments::has_local_blob(&app, &hash)? {
        log::info!("[blob] already local plaintext_hash={hash}");
        return Ok(BlobFetchStatus::Downloaded);
    }

    let conn = database_connection(&app)?;
    let preferred_blossom_url = sync::get_blossom_url(&conn);
    log::info!(
        "[blob] lookup plaintext_hash={hash} preferred_blossom_url={preferred_blossom_url:?}"
    );

    if !crate::secure_storage::is_current_identity_unlocked(&app, &conn)? {
        log::info!("[blob] needs unlock plaintext_hash={hash}");
        return Ok(BlobFetchStatus::NeedsUnlock);
    }

    let (keys, pubkey_hex) = crate::secure_storage::keys_for_current_identity(&app, &conn)?;
    log::info!(
        "[blob] resolved account plaintext_hash={hash} pubkey={pubkey_hex}"
    );

    let meta: Option<(String, String, String)> =
        if let Some(ref blossom_url) = preferred_blossom_url {
            conn.query_row(
                "SELECT server_url, ciphertext_hash, encryption_key
             FROM blob_meta
             WHERE plaintext_hash = ?1 AND pubkey = ?2
             ORDER BY CASE WHEN server_url = ?3 THEN 0 ELSE 1 END, rowid DESC
             LIMIT 1",
                rusqlite::params![hash, pubkey_hex, blossom_url],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .optional()?
        } else {
            conn.query_row(
                "SELECT server_url, ciphertext_hash, encryption_key
             FROM blob_meta
             WHERE plaintext_hash = ?1 AND pubkey = ?2
             ORDER BY rowid DESC
             LIMIT 1",
                rusqlite::params![hash, pubkey_hex],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .optional()?
        };

    let (server_url, ciphertext_hash, key_hex) = match meta {
        Some(m) => m,
        None => {
            log::warn!(
                "[blob] missing metadata plaintext_hash={hash} pubkey={pubkey_hex}"
            );
            return Ok(BlobFetchStatus::Missing);
        }
    };

    log::info!(
        "[blob] metadata found plaintext_hash={} ciphertext_hash={} server_url={} key_len={}",
        hash,
        ciphertext_hash,
        server_url,
        key_hex.len()
    );

    drop(conn);

    let http_client = reqwest::Client::new();
    let ciphertext =
        crate::blossom::download_blob(&http_client, &server_url, &ciphertext_hash, &keys).await?;
    log::info!(
        "[blob] downloaded ciphertext plaintext_hash={} ciphertext_hash={} size={}",
        hash,
        ciphertext_hash,
        ciphertext.len()
    );

    let plaintext = crate::blossom::decrypt_blob(&ciphertext, &key_hex)?;
    log::info!(
        "[blob] decrypted plaintext_hash={} size={}",
        hash,
        plaintext.len()
    );

    let conn2 = database_connection(&app)?;
    let ext: String = conn2
        .query_row(
            "SELECT markdown FROM notes WHERE markdown LIKE ?1 LIMIT 1",
            rusqlite::params![format!("%attachment://{}%", hash)],
            |row| row.get::<_, String>(0),
        )
        .optional()?
        .and_then(|md| sync::extract_blob_extension(&md, &hash))
        .unwrap_or_else(|| "bin".to_string());
    log::info!(
        "[blob] resolved extension plaintext_hash={hash} ext={ext}"
    );

    crate::attachments::save_blob(&app, &hash, &ext, &plaintext)?;
    log::info!("[blob] saved locally plaintext_hash={hash} ext={ext}");
    Ok(BlobFetchStatus::Downloaded)
}

#[tauri::command]
fn remove_blossom_url(app: AppHandle) -> Result<(), AppError> {
    let conn = database_connection(&app)?;
    conn.execute("DELETE FROM app_settings WHERE key = 'blossom_url'", [])?;
    Ok(())
}

#[tauri::command]
fn add_publish_relay(app: AppHandle, url: String) -> Result<Vec<nostr::Relay>, AppError> {
    let conn = database_connection(&app)?;
    nostr::add_publish_relay(&conn, &url)
}

#[tauri::command]
fn remove_relay(app: AppHandle, url: String, kind: String) -> Result<Vec<nostr::Relay>, AppError> {
    let conn = database_connection(&app)?;
    nostr::remove_relay(&conn, &url, &kind)
}

#[tauri::command]
async fn publish_note(
    app: AppHandle,
    input: nostr::PublishNoteInput,
) -> Result<nostr::PublishResult, AppError> {
    nostr::publish_note(&app, input).await
}

#[tauri::command]
async fn publish_short_note(
    app: AppHandle,
    input: nostr::PublishShortNoteInput,
) -> Result<nostr::PublishResult, AppError> {
    nostr::publish_short_note(&app, input).await
}

#[tauri::command]
async fn delete_published_note(
    app: AppHandle,
    note_id: String,
) -> Result<nostr::PublishResult, AppError> {
    nostr::delete_published_note(&app, &note_id).await
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SyncInfo {
    state: sync::SyncState,
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
async fn get_sync_info(app: AppHandle) -> Result<SyncInfo, AppError> {
    let manager = app.state::<sync::SyncManager>();
    let state = manager.state().await;

    let conn = database_connection(&app)?;

    let relay_url = sync::get_sync_relay_url(&conn);
    let blossom_url = sync::get_blossom_url(&conn);
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

    let checkpoint: i64 = sync::get_checkpoint(&conn);

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
fn is_sync_enabled(app: AppHandle) -> Result<bool, AppError> {
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
async fn set_sync_enabled(app: AppHandle, enabled: bool) -> Result<(), AppError> {
    let conn = database_connection(&app)?;
    conn.execute(
        "INSERT OR REPLACE INTO app_settings (key, value) VALUES ('sync_enabled', ?1)",
        rusqlite::params![if enabled { "true" } else { "false" }],
    )?;
    drop(conn);

    let manager = app.state::<sync::SyncManager>();
    if enabled {
        sync::start_if_ready(&app).await?;
    } else {
        manager.stop().await;
    }
    Ok(())
}

#[tauri::command]
async fn get_sync_status(app: AppHandle) -> Result<sync::SyncState, AppError> {
    let manager = app.state::<sync::SyncManager>();
    Ok(manager.state().await)
}

#[tauri::command]
async fn resync(app: AppHandle) -> Result<(), AppError> {
    let manager = app.state::<sync::SyncManager>();
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

    sync::start_if_ready(&app).await?;
    Ok(())
}

#[tauri::command]
async fn restart_sync(app: AppHandle) -> Result<(), AppError> {
    sync::start_if_ready(&app).await?;
    Ok(())
}

#[tauri::command]
async fn unlock_current_account(app: AppHandle) -> Result<(), AppError> {
    let conn = database_connection(&app)?;
    let _ = crate::secure_storage::keys_for_current_identity(&app, &conn)?;
    drop(conn);
    sync::start_if_ready(&app).await?;
    Ok(())
}

#[tauri::command]
async fn unlock_sync(app: AppHandle) -> Result<(), AppError> {
    unlock_current_account(app).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    rustls::crypto::ring::default_provider()
        .install_default()
        .ok();

    let mut log_plugin = tauri_plugin_log::Builder::new()
        .clear_targets()
        .target(Target::new(TargetKind::LogDir {
            file_name: Some("comet".to_string()),
        }))
        .level(log::LevelFilter::Info)
        .level_for("comet_lib::sync", log::LevelFilter::Debug)
        .rotation_strategy(RotationStrategy::KeepSome(5))
        .timezone_strategy(TimezoneStrategy::UseLocal);

    #[cfg(debug_assertions)]
    {
        log_plugin = log_plugin.target(Target::new(TargetKind::Webview));
    }

    tauri::Builder::default()
        .plugin(log_plugin.build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_secure_storage::init())
        .manage(infra::cache::RenderedHtmlCache::default())
        .manage(secure_storage::UnlockedNostrKeys::default())
        .manage(sync::SyncManager::new())
        .setup(|app| {
            db::init_database(app.handle())?;
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                sync::auto_start(&handle).await;
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_status,
            reveal_main_window,
            get_attachments_dir,
            import_image,
            commands::notes::bootstrap,
            commands::notes::todo_count,
            commands::notes::query_notes,
            commands::notes::contextual_tags,
            commands::notes::load_note,
            commands::notes::create_note,
            commands::notes::duplicate_note,
            commands::notes::save_note,
            commands::notes::set_note_readonly,
            commands::notes::archive_note,
            commands::notes::restore_note,
            commands::notes::trash_note,
            commands::notes::restore_from_trash,
            commands::notes::delete_note_permanently,
            commands::notes::empty_trash,
            commands::notes::create_notebook,
            commands::notes::rename_notebook,
            commands::notes::delete_notebook,
            commands::notes::assign_note_notebook,
            commands::notes::pin_note,
            commands::notes::unpin_note,
            commands::notes::search_notes,
            commands::notes::search_tags,
            commands::notes::export_notes,
            commands::accounts::list_accounts,
            commands::accounts::get_account_nsec,
            commands::accounts::add_account,
            commands::accounts::switch_account,
            list_relays,
            set_sync_relay,
            remove_sync_relay,
            add_publish_relay,
            remove_relay,
            publish_note,
            publish_short_note,
            delete_published_note,
            get_blossom_url,
            set_blossom_url,
            remove_blossom_url,
            fetch_blob,
            get_sync_info,
            is_sync_enabled,
            set_sync_enabled,
            get_sync_status,
            restart_sync,
            unlock_current_account,
            unlock_sync,
            resync,
            list_themes,
            read_theme
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            match event {
                #[cfg(target_os = "macos")]
                RunEvent::WindowEvent {
                    event: WindowEvent::CloseRequested { api, .. },
                    ..
                } => {
                    api.prevent_close();
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.hide();
                    }
                    let _ = app.hide();
                }
                #[cfg(target_os = "macos")]
                RunEvent::Reopen { .. } => {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                    let _ = app.show();
                }
                _ => {}
            }
        });
}

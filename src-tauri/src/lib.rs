mod attachments;
mod blossom;
mod db;
mod nostr;
mod notes;
mod sync;

use db::database_connection;
use rusqlite::OptionalExtension;
use notes::{
    AssignNoteNotebookInput, BootstrapPayload, ContextualTagsInput, ContextualTagsPayload,
    CreateNotebookInput, LoadedNote, NotePagePayload, NoteQueryInput, NotebookSummary,
    RenameNotebookInput, SaveNoteInput,
};
use serde::Serialize;
use tauri::{AppHandle, Manager, RunEvent, WindowEvent};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AppStatus {
    version: String,
    database_path: String,
    attachments_path: String,
}

#[tauri::command]
fn app_status(app: AppHandle) -> Result<AppStatus, String> {
    let config_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let database_path = config_dir.join("comet.db");
    let attachments_path = config_dir.join("attachments");

    Ok(AppStatus {
        version: app.config().version.clone().unwrap_or_else(|| "unknown".into()),
        database_path: database_path.to_string_lossy().into_owned(),
        attachments_path: attachments_path.to_string_lossy().into_owned(),
    })
}

#[tauri::command]
fn reveal_main_window(app: AppHandle) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    app.show().map_err(|error| error.to_string())?;

    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Main window not found.".to_string())?;

    window.show().map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_attachments_dir(app: AppHandle) -> Result<String, String> {
    attachments::get_attachments_dir(&app)
}

#[tauri::command]
fn import_image(app: AppHandle, source_path: String) -> Result<attachments::ImportedImage, String> {
    attachments::import_image(&app, &source_path)
}

#[tauri::command]
fn bootstrap(app: AppHandle) -> Result<BootstrapPayload, String> {
    notes::bootstrap(&app)
}

#[tauri::command]
fn query_notes(app: AppHandle, input: NoteQueryInput) -> Result<NotePagePayload, String> {
    notes::query_notes(&app, input)
}

#[tauri::command]
fn contextual_tags(
    app: AppHandle,
    input: ContextualTagsInput,
) -> Result<ContextualTagsPayload, String> {
    notes::contextual_tags(&app, input)
}

#[tauri::command]
fn load_note(app: AppHandle, note_id: String) -> Result<LoadedNote, String> {
    notes::load_note(&app, &note_id)
}

#[tauri::command]
fn create_note(app: AppHandle, notebook_id: Option<String>, tags: Vec<String>) -> Result<LoadedNote, String> {
    notes::create_note(&app, notebook_id.as_deref(), &tags)
}

#[tauri::command]
fn save_note(app: AppHandle, input: SaveNoteInput) -> Result<LoadedNote, String> {
    let note = notes::save_note(&app, input)?;
    sync_push(&app, sync::SyncCommand::PushNote(note.id.clone()));
    Ok(note)
}

#[tauri::command]
fn archive_note(app: AppHandle, note_id: String) -> Result<LoadedNote, String> {
    let note = notes::archive_note(&app, &note_id)?;
    sync_push(&app, sync::SyncCommand::PushNote(note_id.clone()));
    Ok(note)
}

#[tauri::command]
fn restore_note(app: AppHandle, note_id: String) -> Result<LoadedNote, String> {
    let note = notes::restore_note(&app, &note_id)?;
    sync_push(&app, sync::SyncCommand::PushNote(note_id.clone()));
    Ok(note)
}

#[tauri::command]
fn delete_note_permanently(app: AppHandle, note_id: String) -> Result<(), String> {
    // Pre-fetch sync_event_id before the row is deleted
    let sync_event_id: Option<String> = {
        let conn = database_connection(&app)?;
        conn.query_row(
            "SELECT sync_event_id FROM notes WHERE id = ?1",
            rusqlite::params![note_id],
            |row| row.get(0),
        )
        .ok()
        .flatten()
    };
    notes::delete_note_permanently(&app, &note_id)?;
    if sync_event_id.is_some() {
        // Store pending deletion so it survives offline/restart
        let conn = database_connection(&app)?;
        let _ = conn.execute(
            "INSERT OR IGNORE INTO pending_deletions (entity_id, created_at) VALUES (?1, ?2)",
            rusqlite::params![note_id, sync::now_ms_pub()],
        );
        sync_push(&app, sync::SyncCommand::PushDeletion(note_id.clone()));
    }
    Ok(())
}

#[tauri::command]
fn create_notebook(app: AppHandle, input: CreateNotebookInput) -> Result<NotebookSummary, String> {
    let notebook = notes::create_notebook(&app, input)?;
    sync_push(&app, sync::SyncCommand::PushNotebook(notebook.id.clone()));
    Ok(notebook)
}

#[tauri::command]
fn rename_notebook(app: AppHandle, input: RenameNotebookInput) -> Result<NotebookSummary, String> {
    let notebook = notes::rename_notebook(&app, input)?;
    sync_push(&app, sync::SyncCommand::PushNotebook(notebook.id.clone()));
    Ok(notebook)
}

#[tauri::command]
fn delete_notebook(app: AppHandle, notebook_id: String) -> Result<(), String> {
    // Pre-fetch sync_event_id before the row is deleted
    let sync_event_id: Option<String> = {
        let conn = database_connection(&app)?;
        conn.query_row(
            "SELECT sync_event_id FROM notebooks WHERE id = ?1",
            rusqlite::params![notebook_id],
            |row| row.get(0),
        )
        .ok()
        .flatten()
    };
    notes::delete_notebook(&app, &notebook_id)?;
    if sync_event_id.is_some() {
        let conn = database_connection(&app)?;
        let _ = conn.execute(
            "INSERT OR IGNORE INTO pending_deletions (entity_id, created_at) VALUES (?1, ?2)",
            rusqlite::params![notebook_id, sync::now_ms_pub()],
        );
        sync_push(&app, sync::SyncCommand::PushDeletion(notebook_id.clone()));
    }
    Ok(())
}

#[tauri::command]
fn assign_note_notebook(
    app: AppHandle,
    input: AssignNoteNotebookInput,
) -> Result<LoadedNote, String> {
    let note_id = input.note_id.clone();
    let note = notes::assign_note_notebook(&app, input)?;
    sync_push(&app, sync::SyncCommand::PushNote(note_id.clone()));
    Ok(note)
}

#[tauri::command]
fn pin_note(app: AppHandle, note_id: String) -> Result<LoadedNote, String> {
    let note = notes::pin_note(&app, &note_id)?;
    sync_push(&app, sync::SyncCommand::PushNote(note_id.clone()));
    Ok(note)
}

#[tauri::command]
fn unpin_note(app: AppHandle, note_id: String) -> Result<LoadedNote, String> {
    let note = notes::unpin_note(&app, &note_id)?;
    sync_push(&app, sync::SyncCommand::PushNote(note_id.clone()));
    Ok(note)
}

fn sync_push(app: &AppHandle, cmd: sync::SyncCommand) {
    let manager = app.state::<sync::SyncManager>().inner().clone();
    tauri::async_runtime::spawn(async move {
        manager.push(cmd).await;
    });
}

fn reset_sync_state(conn: &rusqlite::Connection) -> Result<(), String> {
    conn.execute("UPDATE notes SET sync_event_id = NULL", [])
        .map_err(|e| e.to_string())?;
    conn.execute("UPDATE notebooks SET sync_event_id = NULL", [])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM app_settings WHERE key = 'sync_checkpoint'", [])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM pending_deletions", [])
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn restart_sync_async(app: &AppHandle) {
    let app_clone = app.clone();
    tauri::async_runtime::spawn(async move {
        let manager = app_clone.state::<sync::SyncManager>();
        manager.start(app_clone.clone()).await;
    });
}

#[tauri::command]
fn import_nsec(app: AppHandle, nsec: String) -> Result<String, String> {
    let conn = database_connection(&app)?;
    let npub = nostr::import_nsec(&conn, &nsec)?;
    reset_sync_state(&conn)?;

    // Collect all note and notebook IDs to re-push under the new key
    let mut stmt = conn
        .prepare("SELECT id FROM notes WHERE archived_at IS NULL")
        .map_err(|e| e.to_string())?;
    let note_ids: Vec<String> = stmt
        .query_map([], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    drop(stmt);
    let mut stmt2 = conn
        .prepare("SELECT id FROM notebooks")
        .map_err(|e| e.to_string())?;
    let notebook_ids: Vec<String> = stmt2
        .query_map([], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    drop(stmt2);
    drop(conn);

    let manager = app.state::<sync::SyncManager>().inner().clone();
    tauri::async_runtime::spawn(async move {
        manager.start(app.clone()).await;
        for nb_id in notebook_ids {
            manager.push(sync::SyncCommand::PushNotebook(nb_id)).await;
        }
        for note_id in note_ids {
            manager.push(sync::SyncCommand::PushNote(note_id)).await;
        }
    });

    Ok(npub)
}

#[tauri::command]
fn list_relays(app: AppHandle) -> Result<Vec<nostr::Relay>, String> {
    let conn = database_connection(&app)?;
    nostr::list_relays(&conn)
}

#[tauri::command]
fn set_sync_relay(app: AppHandle, url: String) -> Result<Vec<nostr::Relay>, String> {
    let conn = database_connection(&app)?;
    let relays = nostr::set_sync_relay(&conn, &url)?;
    reset_sync_state(&conn)?;
    restart_sync_async(&app);
    Ok(relays)
}

#[tauri::command]
fn remove_sync_relay(app: AppHandle) -> Result<Vec<nostr::Relay>, String> {
    let conn = database_connection(&app)?;
    let relays = nostr::remove_sync_relay(&conn)?;
    let app_clone = app.clone();
    tauri::async_runtime::spawn(async move {
        app_clone.state::<sync::SyncManager>().stop().await;
    });
    Ok(relays)
}

#[tauri::command]
fn get_blossom_url(app: AppHandle) -> Result<Option<String>, String> {
    let conn = database_connection(&app)?;
    Ok(sync::get_blossom_url(&conn))
}

#[tauri::command]
fn set_blossom_url(app: AppHandle, url: String) -> Result<(), String> {
    let url = url.trim().trim_end_matches('/').to_string();
    if !url.starts_with("https://") && !url.starts_with("http://") {
        return Err("Blossom URL must start with https:// or http://".into());
    }
    let conn = database_connection(&app)?;
    conn.execute(
        "INSERT OR REPLACE INTO app_settings (key, value) VALUES ('blossom_url', ?1)",
        rusqlite::params![url],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn fetch_blob(app: AppHandle, hash: String) -> Result<bool, String> {
    // Check if already local
    if crate::attachments::has_local_blob(&app, &hash)? {
        return Ok(true);
    }

    let conn = database_connection(&app)?;

    // Look up blob metadata
    let meta: Option<(String, String)> = conn
        .query_row(
            "SELECT ciphertext_hash, encryption_key FROM blob_meta WHERE plaintext_hash = ?1",
            rusqlite::params![hash],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?;

    let (ciphertext_hash, key_hex) = match meta {
        Some(m) => m,
        None => return Ok(false), // no metadata, can't download
    };

    let blossom_url = match sync::get_blossom_url(&conn) {
        Some(u) => u,
        None => return Ok(false),
    };

    // Get keys for decryption and Blossom auth
    let secret_hex: String = conn
        .query_row("SELECT secret_key FROM nostr_identity LIMIT 1", [], |row| row.get(0))
        .optional()
        .map_err(|e| e.to_string())?
        .ok_or("No identity configured")?;

    drop(conn); // release before async work

    let secret_key = nostr_sdk::prelude::SecretKey::parse(&secret_hex)
        .map_err(|e| format!("Invalid secret key: {e}"))?;
    let keys = nostr_sdk::prelude::Keys::new(secret_key);

    // Download from Blossom
    let http_client = reqwest::Client::new();
    let ciphertext = crate::blossom::download_blob(&http_client, &blossom_url, &ciphertext_hash, &keys).await?;

    // Decrypt
    let plaintext = crate::blossom::decrypt_blob(&ciphertext, &key_hex)?;

    // Determine extension from local notes referencing this hash
    let conn2 = database_connection(&app)?;
    let ext: String = conn2
        .query_row(
            "SELECT markdown FROM notes WHERE markdown LIKE ?1 LIMIT 1",
            rusqlite::params![format!("%attachment://{}%", hash)],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .and_then(|md| sync::extract_blob_extension(&md, &hash))
        .unwrap_or_else(|| "bin".to_string());

    crate::attachments::save_blob(&app, &hash, &ext, &plaintext)?;
    Ok(true)
}

#[tauri::command]
fn remove_blossom_url(app: AppHandle) -> Result<(), String> {
    let conn = database_connection(&app)?;
    conn.execute("DELETE FROM app_settings WHERE key = 'blossom_url'", [])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn add_publish_relay(app: AppHandle, url: String) -> Result<Vec<nostr::Relay>, String> {
    let conn = database_connection(&app)?;
    nostr::add_publish_relay(&conn, &url)
}

#[tauri::command]
fn remove_relay(app: AppHandle, url: String, kind: String) -> Result<Vec<nostr::Relay>, String> {
    let conn = database_connection(&app)?;
    nostr::remove_relay(&conn, &url, &kind)
}

#[tauri::command]
async fn publish_note(app: AppHandle, input: nostr::PublishNoteInput) -> Result<nostr::PublishResult, String> {
    nostr::publish_note(&app, input).await
}

#[tauri::command]
async fn delete_published_note(app: AppHandle, note_id: String) -> Result<nostr::PublishResult, String> {
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
async fn get_sync_info(app: AppHandle) -> Result<SyncInfo, String> {
    let manager = app.state::<sync::SyncManager>();
    let state = manager.state().await;

    let conn = database_connection(&app)?;

    let relay_url = sync::get_sync_relay_url(&conn);
    let blossom_url = sync::get_blossom_url(&conn);
    let npub: Option<String> = conn
        .query_row("SELECT npub FROM nostr_identity LIMIT 1", [], |row| row.get(0))
        .optional()
        .map_err(|e| e.to_string())?;

    let synced_notes: i64 = conn
        .query_row("SELECT COUNT(*) FROM notes WHERE sync_event_id IS NOT NULL", [], |row| row.get(0))
        .map_err(|e| e.to_string())?;

    let total_notes: i64 = conn
        .query_row("SELECT COUNT(*) FROM notes WHERE archived_at IS NULL", [], |row| row.get(0))
        .map_err(|e| e.to_string())?;

    let synced_notebooks: i64 = conn
        .query_row("SELECT COUNT(*) FROM notebooks WHERE sync_event_id IS NOT NULL", [], |row| row.get(0))
        .map_err(|e| e.to_string())?;

    let pending_notes: i64 = conn
        .query_row("SELECT COUNT(*) FROM notes WHERE locally_modified = 1", [], |row| row.get(0))
        .map_err(|e| e.to_string())?;

    let pending_notebooks: i64 = conn
        .query_row("SELECT COUNT(*) FROM notebooks WHERE locally_modified = 1", [], |row| row.get(0))
        .map_err(|e| e.to_string())?;

    let checkpoint: i64 = sync::get_checkpoint(&conn);

    let blobs_stored: i64 = conn
        .query_row("SELECT COUNT(*) FROM blob_meta", [], |row| row.get(0))
        .map_err(|e| e.to_string())?;

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
fn is_sync_enabled(app: AppHandle) -> Result<bool, String> {
    let conn = database_connection(&app)?;
    let val: Option<String> = conn
        .query_row(
            "SELECT value FROM app_settings WHERE key = 'sync_enabled'",
            [],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    // Default to true if not set
    Ok(val.as_deref() != Some("false"))
}

#[tauri::command]
async fn set_sync_enabled(app: AppHandle, enabled: bool) -> Result<(), String> {
    let conn = database_connection(&app)?;
    conn.execute(
        "INSERT OR REPLACE INTO app_settings (key, value) VALUES ('sync_enabled', ?1)",
        rusqlite::params![if enabled { "true" } else { "false" }],
    )
    .map_err(|e| e.to_string())?;
    drop(conn);

    let manager = app.state::<sync::SyncManager>();
    if enabled {
        manager.start(app.clone()).await;
    } else {
        manager.stop().await;
    }
    Ok(())
}

#[tauri::command]
async fn get_sync_status(app: AppHandle) -> Result<sync::SyncState, String> {
    let manager = app.state::<sync::SyncManager>();
    Ok(manager.state().await)
}

#[tauri::command]
async fn restart_sync(app: AppHandle) -> Result<(), String> {
    let manager = app.state::<sync::SyncManager>();
    manager.start(app.clone()).await;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(sync::SyncManager::new())
        .setup(|app| {
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
            bootstrap,
            query_notes,
            contextual_tags,
            load_note,
            create_note,
            save_note,
            archive_note,
            restore_note,
            delete_note_permanently,
            create_notebook,
            rename_notebook,
            delete_notebook,
            assign_note_notebook,
            pin_note,
            unpin_note,
            import_nsec,
            list_relays,
            set_sync_relay,
            remove_sync_relay,
            add_publish_relay,
            remove_relay,
            publish_note,
            delete_published_note,
            get_blossom_url,
            set_blossom_url,
            remove_blossom_url,
            fetch_blob,
            get_sync_info,
            is_sync_enabled,
            set_sync_enabled,
            get_sync_status,
            restart_sync
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            match event {
                RunEvent::WindowEvent {
                    event: WindowEvent::CloseRequested { api, .. },
                    ..
                } => {
                    // Hide the window instead of quitting (standard macOS behavior)
                    api.prevent_close();
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.hide();
                    }
                    #[cfg(target_os = "macos")]
                    let _ = app.hide();
                }
                RunEvent::Reopen { .. } => {
                    // Re-show when the dock icon is clicked
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                    #[cfg(target_os = "macos")]
                    let _ = app.show();
                }
                _ => {}
            }
        });
}

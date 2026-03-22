mod attachments;
mod blossom;
mod db;
mod error;
mod markdown;
mod nip44_ext;
mod nip59_ext;
mod nostr;
mod notes;
mod secure_storage;
mod sync;
mod themes;

use db::{
    active_account, active_account_attachments_dir, active_account_dir, app_database_path,
    database_connection,
};
use error::AppError;
use notes::{
    AssignNoteNotebookInput, BootstrapPayload, ContextualTagsInput, ContextualTagsPayload,
    CreateNotebookInput, ExportNotesInput, LoadedNote, NotePagePayload, NoteQueryInput,
    NotebookSummary, RenameNotebookInput, SaveNoteInput, SearchResult, SetNoteReadonlyInput,
};
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
fn search_notes(app: AppHandle, query: String) -> Result<Vec<SearchResult>, AppError> {
    notes::search_notes(&app, &query)
}

#[tauri::command]
fn export_notes(app: AppHandle, input: ExportNotesInput) -> Result<usize, AppError> {
    notes::export_notes(&app, input)
}

#[tauri::command]
fn search_tags(app: AppHandle, query: String) -> Result<Vec<String>, AppError> {
    notes::search_tags(&app, &query)
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

#[tauri::command]
fn bootstrap(app: AppHandle) -> Result<BootstrapPayload, AppError> {
    notes::bootstrap(&app)
}

#[tauri::command]
fn todo_count(app: AppHandle) -> Result<i64, AppError> {
    notes::todo_count(&app)
}

#[tauri::command]
fn query_notes(app: AppHandle, input: NoteQueryInput) -> Result<NotePagePayload, AppError> {
    notes::query_notes(&app, input)
}

#[tauri::command]
fn contextual_tags(
    app: AppHandle,
    input: ContextualTagsInput,
) -> Result<ContextualTagsPayload, AppError> {
    notes::contextual_tags(&app, input)
}

#[tauri::command]
fn load_note(app: AppHandle, note_id: String) -> Result<LoadedNote, AppError> {
    notes::load_note(&app, &note_id)
}

#[tauri::command]
fn create_note(
    app: AppHandle,
    notebook_id: Option<String>,
    tags: Vec<String>,
    markdown: Option<String>,
) -> Result<LoadedNote, AppError> {
    notes::create_note(&app, notebook_id.as_deref(), &tags, markdown.as_deref())
}

#[tauri::command]
fn duplicate_note(app: AppHandle, note_id: String) -> Result<LoadedNote, AppError> {
    let note = notes::duplicate_note(&app, &note_id)?;
    sync_push(&app, sync::SyncCommand::PushNote(note.id.clone()));
    Ok(note)
}

#[tauri::command]
fn save_note(app: AppHandle, input: SaveNoteInput) -> Result<LoadedNote, AppError> {
    let note = notes::save_note(&app, input)?;
    sync_push(&app, sync::SyncCommand::PushNote(note.id.clone()));
    Ok(note)
}

#[tauri::command]
fn set_note_readonly(app: AppHandle, input: SetNoteReadonlyInput) -> Result<LoadedNote, AppError> {
    let note = notes::set_note_readonly(&app, input)?;
    sync_push(&app, sync::SyncCommand::PushNote(note.id.clone()));
    Ok(note)
}

#[tauri::command]
fn archive_note(app: AppHandle, note_id: String) -> Result<LoadedNote, AppError> {
    let note = notes::archive_note(&app, &note_id)?;
    sync_push(&app, sync::SyncCommand::PushNote(note_id.clone()));
    Ok(note)
}

#[tauri::command]
fn restore_note(app: AppHandle, note_id: String) -> Result<LoadedNote, AppError> {
    let note = notes::restore_note(&app, &note_id)?;
    sync_push(&app, sync::SyncCommand::PushNote(note_id.clone()));
    Ok(note)
}

#[tauri::command]
fn trash_note(app: AppHandle, note_id: String) -> Result<LoadedNote, AppError> {
    let note = notes::trash_note(&app, &note_id)?;
    sync_push(&app, sync::SyncCommand::PushNote(note_id.clone()));
    Ok(note)
}

#[tauri::command]
fn restore_from_trash(app: AppHandle, note_id: String) -> Result<LoadedNote, AppError> {
    let note = notes::restore_from_trash(&app, &note_id)?;
    sync_push(&app, sync::SyncCommand::PushNote(note_id.clone()));
    Ok(note)
}

#[tauri::command]
fn delete_note_permanently(app: AppHandle, note_id: String) -> Result<(), AppError> {
    let blossom_deletions = notes::delete_note_permanently(&app, &note_id)?;
    spawn_blossom_deletions(&app, blossom_deletions);
    // Always queue deletion — covers the race where sync pushes the note
    // between creation and deletion, and is a harmless no-op if never synced.
    let conn = database_connection(&app)?;
    let _ = conn.execute(
        "INSERT OR IGNORE INTO pending_deletions (entity_id, created_at) VALUES (?1, ?2)",
        rusqlite::params![note_id, error::now_millis()],
    );
    sync_push(&app, sync::SyncCommand::PushDeletion(note_id.clone()));
    Ok(())
}

#[tauri::command]
fn empty_trash(app: AppHandle) -> Result<(), AppError> {
    let (note_ids, blossom_deletions) = notes::empty_trash(&app)?;
    spawn_blossom_deletions(&app, blossom_deletions);
    let conn = database_connection(&app)?;
    for note_id in &note_ids {
        let _ = conn.execute(
            "INSERT OR IGNORE INTO pending_deletions (entity_id, created_at) VALUES (?1, ?2)",
            rusqlite::params![note_id, error::now_millis()],
        );
        sync_push(&app, sync::SyncCommand::PushDeletion(note_id.clone()));
    }
    Ok(())
}

#[tauri::command]
fn create_notebook(
    app: AppHandle,
    input: CreateNotebookInput,
) -> Result<NotebookSummary, AppError> {
    let notebook = notes::create_notebook(&app, input)?;
    sync_push(&app, sync::SyncCommand::PushNotebook(notebook.id.clone()));
    Ok(notebook)
}

#[tauri::command]
fn rename_notebook(
    app: AppHandle,
    input: RenameNotebookInput,
) -> Result<NotebookSummary, AppError> {
    let notebook = notes::rename_notebook(&app, input)?;
    sync_push(&app, sync::SyncCommand::PushNotebook(notebook.id.clone()));
    Ok(notebook)
}

#[tauri::command]
fn delete_notebook(app: AppHandle, notebook_id: String) -> Result<(), AppError> {
    notes::delete_notebook(&app, &notebook_id)?;
    let conn = database_connection(&app)?;
    let _ = conn.execute(
        "INSERT OR IGNORE INTO pending_deletions (entity_id, created_at) VALUES (?1, ?2)",
        rusqlite::params![notebook_id, error::now_millis()],
    );
    sync_push(&app, sync::SyncCommand::PushDeletion(notebook_id.clone()));
    Ok(())
}

#[tauri::command]
fn assign_note_notebook(
    app: AppHandle,
    input: AssignNoteNotebookInput,
) -> Result<LoadedNote, AppError> {
    let note_id = input.note_id.clone();
    let note = notes::assign_note_notebook(&app, input)?;
    sync_push(&app, sync::SyncCommand::PushNote(note_id.clone()));
    Ok(note)
}

#[tauri::command]
fn pin_note(app: AppHandle, note_id: String) -> Result<LoadedNote, AppError> {
    let note = notes::pin_note(&app, &note_id)?;
    sync_push(&app, sync::SyncCommand::PushNote(note_id.clone()));
    Ok(note)
}

#[tauri::command]
fn unpin_note(app: AppHandle, note_id: String) -> Result<LoadedNote, AppError> {
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

/// Spawn async Blossom blob deletions for orphaned blobs.
/// blossom_deletions is a list of (server_url, ciphertext_hash) pairs.
fn spawn_blossom_deletions(app: &AppHandle, blossom_deletions: Vec<(String, String)>) {
    if blossom_deletions.is_empty() {
        return;
    }

    let conn = match database_connection(app) {
        Ok(c) => c,
        Err(_) => return,
    };
    let (keys, _) = match crate::secure_storage::keys_for_current_identity(app, &conn) {
        Ok(identity) => identity,
        Err(_) => return,
    };
    drop(conn);

    tauri::async_runtime::spawn(async move {
        let client = reqwest::Client::new();
        for (server_url, ciphertext_hash) in blossom_deletions {
            if let Err(e) =
                crate::blossom::delete_blob(&client, &server_url, &ciphertext_hash, &keys).await
            {
                eprintln!("[blob-gc] failed to delete from Blossom: {e}");
            }
        }
    });
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
fn list_accounts(app: AppHandle) -> Result<Vec<db::AccountSummary>, AppError> {
    db::list_accounts(&app)
}

#[tauri::command]
fn get_account_nsec(app: AppHandle, public_key: String) -> Result<String, AppError> {
    let account_exists = db::list_accounts(&app)?
        .into_iter()
        .any(|account| account.public_key == public_key);
    if !account_exists {
        return Err(AppError::custom(format!("Unknown account: {public_key}")));
    }

    secure_storage::load_account_nsec(&app, &public_key)
}

async fn run_account_change<T>(
    app: &AppHandle,
    change: impl FnOnce() -> Result<T, AppError>,
) -> Result<T, AppError> {
    let manager = app.state::<sync::SyncManager>();
    manager.stop().await;

    let result = change();
    if result.is_ok() {
        notes::clear_rendered_html_cache(app);
    }
    sync::auto_start(app).await;
    result
}

#[tauri::command]
async fn add_account(app: AppHandle, nsec: String) -> Result<db::AccountSummary, AppError> {
    run_account_change(&app, || db::add_account(&app, &nsec)).await
}

#[tauri::command]
async fn switch_account(
    app: AppHandle,
    public_key: String,
) -> Result<db::AccountSummary, AppError> {
    run_account_change(&app, || db::switch_account(&app, &public_key)).await
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
async fn fetch_blob(app: AppHandle, hash: String) -> Result<bool, AppError> {
    // Check if already local
    if crate::attachments::has_local_blob(&app, &hash)? {
        return Ok(true);
    }

    let conn = database_connection(&app)?;

    let blossom_url = match sync::get_blossom_url(&conn) {
        Some(u) => u,
        None => return Ok(false),
    };

    // Get keys for decryption and Blossom auth
    let (keys, pubkey_hex) = crate::secure_storage::keys_for_current_identity(&app, &conn)?;

    // Look up blob metadata for the current server + identity
    let meta: Option<(String, String)> = conn
        .query_row(
            "SELECT ciphertext_hash, encryption_key FROM blob_meta WHERE plaintext_hash = ?1 AND server_url = ?2 AND pubkey = ?3",
            rusqlite::params![hash, blossom_url, pubkey_hex],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()?;

    let (ciphertext_hash, key_hex) = match meta {
        Some(m) => m,
        None => return Ok(false), // no metadata for this server+identity, can't download
    };

    drop(conn); // release before async work

    // Download from Blossom
    let http_client = reqwest::Client::new();
    let ciphertext =
        crate::blossom::download_blob(&http_client, &blossom_url, &ciphertext_hash, &keys).await?;

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
        .optional()?
        .and_then(|md| sync::extract_blob_extension(&md, &hash))
        .unwrap_or_else(|| "bin".to_string());

    crate::attachments::save_blob(&app, &hash, &ext, &plaintext)?;
    Ok(true)
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
    // Default to false if not set
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
    // Stop sync first
    let manager = app.state::<sync::SyncManager>();
    manager.stop().await;

    // Wipe all local data except identity, relays, and app_settings
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

    // Restart sync — will pull everything fresh from the relay
    sync::start_if_ready(&app).await?;
    Ok(())
}

#[tauri::command]
async fn restart_sync(app: AppHandle) -> Result<(), AppError> {
    sync::start_if_ready(&app).await?;
    Ok(())
}

#[tauri::command]
async fn unlock_sync(app: AppHandle) -> Result<(), AppError> {
    let conn = database_connection(&app)?;
    let _ = crate::secure_storage::keys_for_current_identity(&app, &conn)?;
    drop(conn);
    sync::start_if_ready(&app).await?;
    Ok(())
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
        .manage(notes::RenderedHtmlCache::default())
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
            bootstrap,
            todo_count,
            query_notes,
            contextual_tags,
            load_note,
            create_note,
            duplicate_note,
            save_note,
            set_note_readonly,
            archive_note,
            restore_note,
            trash_note,
            restore_from_trash,
            delete_note_permanently,
            empty_trash,
            create_notebook,
            rename_notebook,
            delete_notebook,
            assign_note_notebook,
            pin_note,
            unpin_note,
            list_accounts,
            get_account_nsec,
            add_account,
            switch_account,
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
            unlock_sync,
            resync,
            search_notes,
            search_tags,
            export_notes,
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
                    // Hide the window instead of quitting (standard macOS behavior)
                    api.prevent_close();
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.hide();
                    }
                    let _ = app.hide();
                }
                #[cfg(target_os = "macos")]
                RunEvent::Reopen { .. } => {
                    // Re-show when the dock icon is clicked
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

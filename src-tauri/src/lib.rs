mod attachments;
mod db;
mod nostr;
mod notes;
mod sync;

use db::database_connection;
use notes::{
    AssignNoteNotebookInput, BootstrapPayload, ContextualTagsInput, ContextualTagsPayload,
    CreateNotebookInput, LoadedNote, NotePagePayload, NoteQueryInput, NotebookSummary,
    RenameNotebookInput, SaveNoteInput,
};
use serde::Serialize;
use tauri::{AppHandle, Manager};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AppStatus {
    app_name: &'static str,
    editor: &'static str,
    storage: &'static str,
    publishing: &'static str,
    updated_at: &'static str,
}

#[tauri::command]
fn app_status() -> AppStatus {
    AppStatus {
        app_name: "comet",
        editor: "CodeMirror",
        storage: "Local SQLite note store with markdown as the content format",
        publishing: "explicit Nostr publishing",
        updated_at: "2026-03-12",
    }
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
    sync_push_note(&app, &note.id);
    Ok(note)
}

#[tauri::command]
fn archive_note(app: AppHandle, note_id: String) -> Result<LoadedNote, String> {
    let note = notes::archive_note(&app, &note_id)?;
    sync_push_note(&app, &note_id);
    Ok(note)
}

#[tauri::command]
fn restore_note(app: AppHandle, note_id: String) -> Result<LoadedNote, String> {
    let note = notes::restore_note(&app, &note_id)?;
    sync_push_note(&app, &note_id);
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
    if let Some(event_id) = sync_event_id {
        sync_push_deletion(&app, &note_id, &event_id);
    }
    Ok(())
}

#[tauri::command]
fn create_notebook(app: AppHandle, input: CreateNotebookInput) -> Result<NotebookSummary, String> {
    notes::create_notebook(&app, input)
}

#[tauri::command]
fn rename_notebook(app: AppHandle, input: RenameNotebookInput) -> Result<NotebookSummary, String> {
    notes::rename_notebook(&app, input)
}

#[tauri::command]
fn delete_notebook(app: AppHandle, notebook_id: String) -> Result<(), String> {
    notes::delete_notebook(&app, &notebook_id)
}

#[tauri::command]
fn assign_note_notebook(
    app: AppHandle,
    input: AssignNoteNotebookInput,
) -> Result<LoadedNote, String> {
    let note_id = input.note_id.clone();
    let note = notes::assign_note_notebook(&app, input)?;
    sync_push_note(&app, &note_id);
    Ok(note)
}

#[tauri::command]
fn pin_note(app: AppHandle, note_id: String) -> Result<LoadedNote, String> {
    let note = notes::pin_note(&app, &note_id)?;
    sync_push_note(&app, &note_id);
    Ok(note)
}

#[tauri::command]
fn unpin_note(app: AppHandle, note_id: String) -> Result<LoadedNote, String> {
    let note = notes::unpin_note(&app, &note_id)?;
    sync_push_note(&app, &note_id);
    Ok(note)
}

fn sync_push_note(app: &AppHandle, note_id: &str) {
    let manager = app.state::<sync::SyncManager>();
    let note_id = note_id.to_string();
    let manager = manager.inner().clone();
    tauri::async_runtime::spawn(async move {
        manager.push(sync::SyncCommand::PushNote(note_id)).await;
    });
}

fn sync_push_deletion(app: &AppHandle, note_id: &str, sync_event_id: &str) {
    let manager = app.state::<sync::SyncManager>();
    let note_id = note_id.to_string();
    let sync_event_id = sync_event_id.to_string();
    let manager = manager.inner().clone();
    tauri::async_runtime::spawn(async move {
        manager
            .push(sync::SyncCommand::PushDeletion(note_id, sync_event_id))
            .await;
    });
}

#[tauri::command]
fn import_nsec(app: AppHandle, nsec: String) -> Result<String, String> {
    let conn = database_connection(&app)?;
    let npub = nostr::import_nsec(&conn, &nsec)?;
    // Reset sync state on identity change
    conn.execute("UPDATE notes SET sync_event_id = NULL", [])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM app_settings WHERE key = 'sync_checkpoint'", [])
        .map_err(|e| e.to_string())?;
    let app_clone = app.clone();
    tauri::async_runtime::spawn(async move {
        let manager = app_clone.state::<sync::SyncManager>();
        manager.start(app_clone.clone()).await;
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
    // Clear checkpoint and restart sync for new relay
    conn.execute("UPDATE notes SET sync_event_id = NULL", [])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM app_settings WHERE key = 'sync_checkpoint'", [])
        .map_err(|e| e.to_string())?;
    let app_clone = app.clone();
    tauri::async_runtime::spawn(async move {
        let manager = app_clone.state::<sync::SyncManager>();
        manager.start(app_clone.clone()).await;
    });
    Ok(relays)
}

#[tauri::command]
fn remove_sync_relay(app: AppHandle) -> Result<Vec<nostr::Relay>, String> {
    let conn = database_connection(&app)?;
    let relays = nostr::remove_sync_relay(&conn)?;
    let app_clone = app.clone();
    tauri::async_runtime::spawn(async move {
        let manager = app_clone.state::<sync::SyncManager>();
        manager.stop().await;
    });
    Ok(relays)
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
            get_sync_status,
            restart_sync
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

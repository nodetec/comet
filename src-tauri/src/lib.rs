mod attachments;
mod db;
mod nostr;
mod notes;

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
    notes::save_note(&app, input)
}

#[tauri::command]
fn archive_note(app: AppHandle, note_id: String) -> Result<LoadedNote, String> {
    notes::archive_note(&app, &note_id)
}

#[tauri::command]
fn restore_note(app: AppHandle, note_id: String) -> Result<LoadedNote, String> {
    notes::restore_note(&app, &note_id)
}

#[tauri::command]
fn delete_note_permanently(app: AppHandle, note_id: String) -> Result<(), String> {
    notes::delete_note_permanently(&app, &note_id)
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
    notes::assign_note_notebook(&app, input)
}

#[tauri::command]
fn pin_note(app: AppHandle, note_id: String) -> Result<LoadedNote, String> {
    notes::pin_note(&app, &note_id)
}

#[tauri::command]
fn unpin_note(app: AppHandle, note_id: String) -> Result<LoadedNote, String> {
    notes::unpin_note(&app, &note_id)
}

#[tauri::command]
fn import_nsec(app: AppHandle, nsec: String) -> Result<String, String> {
    let conn = database_connection(&app)?;
    nostr::import_nsec(&conn, &nsec)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
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
            import_nsec
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

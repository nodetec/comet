// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::{Arc, Mutex};

mod services;
use services::{ContextMenuService, NoteService, NoteTagService, TagService};

use tauri::{
    menu::{MenuEvent, MenuId},
    path::BaseDirectory,
    AppHandle, Manager, State,
};

mod db;

mod models;
mod utils;
use models::{
    APIResponse, ArchivedNote, ContextMenuEvent, ContextMenuItemId, ContextMenuRequest, CreateNoteRequest, CreateTagRequest, DBConn, GetTagRequest, ListNotesRequest, Note, Tag, TagNoteRequest, UpdateNoteRequest
};

// Notes

#[tauri::command]
fn create_note(
    create_note_request: CreateNoteRequest,
    note_service: State<'_, NoteService>,
) -> APIResponse<Note> {
    note_service.create_note(create_note_request)
}

#[tauri::command]
fn update_note(
    update_note_request: UpdateNoteRequest,
    note_service: State<'_, NoteService>,
) -> APIResponse<Note> {
    note_service.update_note(update_note_request)
}

#[tauri::command]
fn archive_note(note_id: i64, note_service: State<'_, NoteService>) -> () {
    note_service.archive_note(&note_id)
}

#[tauri::command]
fn delete_note(note_id: i64, note_service: State<'_, NoteService>) -> () {
    note_service.delete_note(&note_id)
}

#[tauri::command]
fn list_notes(
    list_notes_request: ListNotesRequest,
    note_service: State<'_, NoteService>,
) -> APIResponse<Vec<Note>> {
    note_service.list_notes(&list_notes_request)
}

#[tauri::command]
fn list_archived_notes(
    list_notes_request: ListNotesRequest,
    note_service: State<'_, NoteService>,
) -> APIResponse<Vec<ArchivedNote>> {
    note_service.list_archived_notes(&list_notes_request)
}

// Tags

#[tauri::command]
fn create_tag(
    create_tag_request: CreateTagRequest,
    tag_service: State<'_, TagService>,
) -> APIResponse<Tag> {
    tag_service.create_tag(create_tag_request)
}

#[tauri::command]
fn list_tags(tag_service: State<'_, TagService>) -> APIResponse<Vec<Tag>> {
    tag_service.list_tags()
}

#[tauri::command]
fn get_tag(get_tag_request: GetTagRequest, tag_service: State<'_, TagService>) -> APIResponse<Tag> {
    tag_service.get_tag(get_tag_request)
}

// Tag Notes

#[tauri::command]
fn tag_note(
    tag_note_request: TagNoteRequest,
    tag_note_service: State<'_, NoteTagService>,
) -> APIResponse<()> {
    tag_note_service.tag_note(tag_note_request)
}

// Context Menu

#[tauri::command]
fn create_context_menu(
    window: tauri::Window,
    create_context_menu_request: ContextMenuRequest,
    app_handle: AppHandle,
    create_menu_service: State<'_, ContextMenuService>,
) -> APIResponse<()> {
    create_menu_service.create_context_menu(
        window,
        app_handle.clone(),
        &create_context_menu_request,
    )
}

#[tauri::command]
fn handle_menu_event(app_handle: &tauri::AppHandle, event: MenuEvent) {
    let app_handle_clone = app_handle.clone();
    let note_service: State<NoteService> = app_handle_clone.state();
    let tag_service: State<TagService> = app_handle_clone.state();

    let context_menu_item_id: State<Mutex<ContextMenuItemId>> = app_handle_clone.state();
    let mut context_menu_item_id = context_menu_item_id.lock().unwrap();

    let archive_note_menu_id = MenuId(String::from("archive_note"));
    let delete_tag_menu_id = MenuId(String::from("delete_tag"));

    match event.id() {
        id if id == &archive_note_menu_id => {
            note_service.archive_note(&context_menu_item_id.0.unwrap());
            let context_menu_event = ContextMenuEvent {
                id: match context_menu_item_id.0 {
                    Some(id) => id,
                    None => 0,
                },
                event_kind: String::from("archive_note"),
            };
            app_handle.emit("menu_event", context_menu_event).unwrap();
        }

        id if id == &delete_tag_menu_id => {
            tag_service.delete_tag(&context_menu_item_id.0.unwrap());
            let context_menu_event = ContextMenuEvent {
                id: match context_menu_item_id.0 {
                    Some(id) => id,
                    None => 0,
                },
                event_kind: String::from("delete_tag"),
            };
            app_handle.emit("menu_event", context_menu_event).unwrap();
        }

        _ => {
            context_menu_item_id.0 = None;
        }
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(Mutex::new(ContextMenuItemId(None)))
        .setup(|app| {
            let db_path = app
                .path()
                // create a captainslog directory in the user's data directory
                .resolve("captains_log.db", BaseDirectory::Data)?;
            let conn = db::establish_connection(db_path.to_str().unwrap()).expect("Failed to connect to database");
            let db_conn: DBConn = DBConn(Arc::new(Mutex::new(conn)));
            let connection = Arc::new(db_conn);
            let note_service = NoteService::new(connection.clone());
            let tag_service = TagService::new(connection.clone());
            let tag_note_service: NoteTagService = NoteTagService::new(connection.clone());
            let context_menu_service: ContextMenuService = ContextMenuService::new();
            app.manage(note_service);
            app.manage(tag_service);
            app.manage(tag_note_service);
            app.manage(context_menu_service);
            {
                app.on_menu_event(|app_handle: &tauri::AppHandle, event| {
                    handle_menu_event(app_handle, event);
                });
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            create_note,
            update_note,
            list_notes,
            create_tag,
            list_tags,
            get_tag,
            tag_note,
            create_context_menu,
            delete_note,
            archive_note,
            list_archived_notes
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

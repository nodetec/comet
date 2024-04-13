// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::{Arc, Mutex};

mod services;
use services::{ContextMenuService, NoteService, NoteTagService, TagService};

use tauri::{AppHandle, State};

mod db;

mod models;
mod utils;
use models::{
    APIResponse, ContextMenuRequest, CreateNoteRequest, CreateTagRequest, DBConn, GetTagRequest,
    ListNotesRequest, Note, Tag, TagNoteRequest, UpdateNoteRequest,
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
fn delete_note(
    note_id: i64,
    note_service: State<'_, NoteService>,
) -> () {
    note_service.delete_note(&note_id)
}

#[tauri::command]
fn list_notes(
    list_notes_request: ListNotesRequest,
    note_service: State<'_, NoteService>,
) -> APIResponse<Vec<Note>> {
    note_service.list_notes(&list_notes_request)
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

//Tag Notes

#[tauri::command]
fn tag_note(
    tag_note_request: TagNoteRequest,
    tag_note_service: State<'_, NoteTagService>,
) -> APIResponse<()> {
    tag_note_service.tag_note(tag_note_request)
}

#[tauri::command]
fn create_context_menu(
    window: tauri::Window,
    create_context_menu_request: ContextMenuRequest,
    app_handle: AppHandle,
    create_menu_service: State<'_, ContextMenuService>,
) -> APIResponse<()> {
    create_menu_service.create_context_menu(window, app_handle, &create_context_menu_request)
}

fn main() {
    let conn = db::establish_connection().expect("Failed to connect to database");
    let db_conn: DBConn = DBConn(Arc::new(Mutex::new(conn)));
    let connection = Arc::new(db_conn);
    let note_service = NoteService::new(connection.clone());
    let tag_service = TagService::new(connection.clone());
    let tag_note_service: NoteTagService = NoteTagService::new(connection.clone());
    let context_menu_service: ContextMenuService = ContextMenuService::new(connection.clone());

    tauri::Builder::default()
        // Here you manage the instantiated NoteService with the Tauri state
        .manage(note_service)
        .manage(tag_service)
        .manage(tag_note_service)
        .manage(context_menu_service)
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            {
              app.on_menu_event(|app_handle: &tauri::AppHandle, event| {
                println!("menu event: {:?}", event);
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
            delete_note
        ])

        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

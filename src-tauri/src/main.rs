// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::{Arc, Mutex};

mod services;
use services::{NoteService, NoteTagService, TagService};

use tauri::{
    menu::{ContextMenu, Menu, MenuItem},
    Manager, State,
};

mod db;

mod models;
mod utils;
use models::{
    APIResponse, CreateNoteRequest, CreateTagRequest, DBConn, GetTagRequest, ListNotesRequest,
    Note, Tag, TagNoteRequest, UpdateNoteRequest,
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
fn create_context_menu(window: tauri::Window) -> () {
    let manager = window.app_handle();
    let context_menu = Menu::with_items(
        manager,
        &[
            &MenuItem::with_id(manager, "open_file", "Open File", true, None::<&str>).unwrap(),
            &MenuItem::with_id(
                manager,
                "open_folder",
                "Open File Folder",
                true,
                None::<&str>,
            )
            .unwrap(),
        ],
    )
    .unwrap();

    context_menu.popup(window).unwrap();
}

fn main() {
    let conn = db::establish_connection().expect("Failed to connect to database");
    let db_conn: DBConn = DBConn(Arc::new(Mutex::new(conn)));
    let connection = Arc::new(db_conn);
    let note_service = NoteService::new(connection.clone());
    let tag_service = TagService::new(connection.clone());
    let tag_note_service = NoteTagService::new(connection.clone());

    tauri::Builder::default()
        // Here you manage the instantiated NoteService with the Tauri state
        .manage(note_service)
        .manage(tag_service)
        .manage(tag_note_service)
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            create_note,
            update_note,
            list_notes,
            create_tag,
            list_tags,
            get_tag,
            tag_note,
            create_context_menu
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

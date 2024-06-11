use std::sync::Mutex;

use tauri::{
    menu::{ContextMenu, Menu, MenuItem},
    AppHandle, Manager, State, Window,
};

use crate::models::{
    APIResponse, ContextMenuRequest, ContextMenuState, MenuKind, NoteItemContextMenuRequest,
    NoteTagItemContextMenuRequest, TagItemContextMenuRequest,
};

pub struct ContextMenuService {}
fn create_note_context_menu(
    window: Window,
    app_handle: AppHandle,
    note_item_context_menu_request: &NoteItemContextMenuRequest,
) -> APIResponse<()> {
    let context_menu_item_id: State<Mutex<ContextMenuState>> = app_handle.state();
    let mut context_menu_state = context_menu_item_id.lock().unwrap();
    context_menu_state.note_id = Some(note_item_context_menu_request.id);
    let manager = window.app_handle();
    let context_menu = Menu::with_items(
        manager,
        &[&MenuItem::with_id(manager, "trash_note", "Move To Trash", true, None::<&str>).unwrap()],
    )
    .unwrap();

    context_menu.popup(window).unwrap();
    APIResponse::Data(None)
}

fn create_tag_context_menu(
    window: Window,
    app_handle: AppHandle,
    tag_item_context_menu_request: &TagItemContextMenuRequest,
) -> APIResponse<()> {
    let context_menu_item_id: State<Mutex<ContextMenuState>> = app_handle.state();
    let mut context_menu_state = context_menu_item_id.lock().unwrap();
    context_menu_state.tag_id = Some(tag_item_context_menu_request.id);
    let manager = window.app_handle();
    let context_menu = Menu::with_items(
        manager,
        &[&MenuItem::with_id(manager, "delete_tag", "Delete", true, None::<&str>).unwrap()],
    )
    .unwrap();

    context_menu.popup(window).unwrap();
    APIResponse::Data(None)
}

fn create_note_tag_context_menu(
    window: Window,
    app_handle: AppHandle,
    note_tag_item_context_menu_request: &NoteTagItemContextMenuRequest,
) -> APIResponse<()> {
    let context_menu_item_id: State<Mutex<ContextMenuState>> = app_handle.state();
    let mut context_menu_state = context_menu_item_id.lock().unwrap();
    context_menu_state.note_id = Some(note_tag_item_context_menu_request.note_id);
    context_menu_state.tag_id = Some(note_tag_item_context_menu_request.tag_id);
    let manager = window.app_handle();
    let context_menu = Menu::with_items(
        manager,
        &[&MenuItem::with_id(manager, "untag_note", "Remove", true, None::<&str>).unwrap()],
    )
    .unwrap();

    context_menu.popup(window).unwrap();
    APIResponse::Data(None)
}

impl ContextMenuService {
    pub fn new() -> Self {
        ContextMenuService {}
    }

    pub fn create_context_menu(
        &self,
        window: Window,
        app_handle: AppHandle,
        create_context_menu_request: &ContextMenuRequest,
    ) -> APIResponse<()> {
        match &create_context_menu_request.menu_kind {
            MenuKind::NoteItem(note_item_context_menu_request) => {
                create_note_context_menu(window, app_handle, note_item_context_menu_request)
            }
            MenuKind::TagItem(tag_item_context_menu_request) => {
                create_tag_context_menu(window, app_handle, tag_item_context_menu_request)
            }
            MenuKind::NoteTag(note_tag_item_context_menu_request) => {
                create_note_tag_context_menu(window, app_handle, note_tag_item_context_menu_request)
            }
        }
    }
}

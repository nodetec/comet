use std::sync::Mutex;

use tauri::{
    menu::{ContextMenu, Menu, MenuItem},
    AppHandle, Manager, State, Window,
};

use crate::models::{APIResponse, ContextMenuItemId, ContextMenuRequest, MenuKind};

pub struct ContextMenuService {}
fn create_note_context_menu(window: Window) -> APIResponse<()> {
    let manager = window.app_handle();
    let context_menu = Menu::with_items(
        manager,
        &[&MenuItem::with_id(manager, "archive_note", "Delete", true, None::<&str>).unwrap()],
    )
    .unwrap();

    context_menu.popup(window).unwrap();
    APIResponse {
        success: true,
        message: Some(format!("Success")),
        data: None,
    }
}

fn create_tag_context_menu(window: Window) -> APIResponse<()> {
    let manager = window.app_handle();
    let context_menu = Menu::with_items(
        manager,
        &[&MenuItem::with_id(manager, "delete_tag", "Delete", true, None::<&str>).unwrap()],
    )
    .unwrap();

    context_menu.popup(window).unwrap();
    APIResponse {
        success: true,
        message: Some(format!("Success")),
        data: None,
    }
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
        let context_menu_item_id: State<Mutex<ContextMenuItemId>> = app_handle.state();
        let mut context_menu_item_id = context_menu_item_id.lock().unwrap();
        context_menu_item_id.0 = Some(create_context_menu_request.id.unwrap());
        match create_context_menu_request.menu_kind {
            MenuKind::NoteItem => create_note_context_menu(window),
            MenuKind::TagItem => create_tag_context_menu(window),
        }
    }
}

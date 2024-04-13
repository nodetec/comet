use tauri::{
    menu::{ContextMenu, Menu, MenuItem}, AppHandle, Manager, Window
};

use crate::{
    db,
    models::{APIResponse, ContextMenuRequest, DBConn, MenuKind},
};
use std::sync::Arc;

pub struct ContextMenuService {
    db_conn: Arc<DBConn>,
}
fn create_note_context_menu(window: Window) -> APIResponse<()> {
    let manager = window.app_handle();
    let context_menu = Menu::with_items(
        manager,
        &[
            &MenuItem::with_id(manager, "delete_note", "Delete", true, None::<&str>).unwrap(),
        ],
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
    pub fn new(db_conn: Arc<DBConn>) -> Self {
        ContextMenuService { db_conn }
    }


    pub fn create_context_menu(
        &self,
        window: Window,
        app_handle: AppHandle,
        create_menu_request: &ContextMenuRequest,
    ) -> APIResponse<()> {
        
        match create_menu_request.menu_kind {
            MenuKind::NoteItem => {
                println!("Lucky penny!");
                create_note_context_menu(window)
            },
            MenuKind::TagItem => {
                println!("poobus penny!");
                create_note_context_menu(window)
            },
        }

        // match db::tag_note(&conn, &tag_note_request) {
        //     Ok(tag_id) => APIResponse {
        //         success: true,
        //         message: Some(format!("Tagged note successfully")),
        //         data: Some(()),
        //     },
        //     Err(e) => APIResponse {
        //         success: false,
        //         message: Some(format!("Failed to tag note")),
        //         data: None,
        //     },
        // }
    }
}

mod adapters;
mod commands;
mod db;
mod domain;
mod error;
mod infra;
mod ports;

use tauri::{Manager, RunEvent, WindowEvent};
use tauri_plugin_log::{RotationStrategy, Target, TargetKind, TimezoneStrategy};

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
        .level_for("comet_lib::adapters::nostr::sync_manager", log::LevelFilter::Debug)
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
        .manage(infra::cache::RenderedHtmlCache::default())
        .manage(crate::adapters::tauri::key_store::UnlockedNostrKeys::default())
        .manage(crate::adapters::nostr::sync_manager::SyncManager::new())
        .setup(|app| {
            db::init_database(app.handle())?;
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                crate::adapters::nostr::sync_manager::auto_start(&handle).await;
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // App
            commands::app::app_status,
            commands::app::reveal_main_window,
            commands::app::get_attachments_dir,
            commands::app::import_image,
            commands::app::list_themes,
            commands::app::read_theme,
            // Notes
            commands::notes::bootstrap,
            commands::notes::todo_count,
            commands::notes::query_notes,
            commands::notes::contextual_tags,
            commands::notes::load_note,
            commands::notes::create_note,
            commands::notes::duplicate_note,
            commands::notes::save_note,
            commands::notes::set_note_readonly,
            commands::notes::archive_note,
            commands::notes::restore_note,
            commands::notes::trash_note,
            commands::notes::restore_from_trash,
            commands::notes::delete_note_permanently,
            commands::notes::empty_trash,
            commands::notes::create_notebook,
            commands::notes::rename_notebook,
            commands::notes::delete_notebook,
            commands::notes::assign_note_notebook,
            commands::notes::pin_note,
            commands::notes::unpin_note,
            commands::notes::search_notes,
            commands::notes::search_tags,
            commands::notes::export_notes,
            // Accounts
            commands::accounts::list_accounts,
            commands::accounts::get_account_nsec,
            commands::accounts::add_account,
            commands::accounts::switch_account,
            // Sync & Relays
            commands::sync::list_relays,
            commands::sync::set_sync_relay,
            commands::sync::remove_sync_relay,
            commands::sync::add_publish_relay,
            commands::sync::remove_relay,
            commands::sync::publish_note,
            commands::sync::publish_short_note,
            commands::sync::delete_published_note,
            commands::sync::get_sync_info,
            commands::sync::is_sync_enabled,
            commands::sync::set_sync_enabled,
            commands::sync::get_sync_status,
            commands::sync::restart_sync,
            commands::sync::unlock_current_account,
            commands::sync::unlock_sync,
            commands::sync::resync,
            // Blob
            commands::blob::get_blossom_url,
            commands::blob::set_blossom_url,
            commands::blob::remove_blossom_url,
            commands::blob::fetch_blob,
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
                    api.prevent_close();
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.hide();
                    }
                    let _ = app.hide();
                }
                #[cfg(target_os = "macos")]
                RunEvent::Reopen { .. } => {
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

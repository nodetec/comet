use crate::db::{
    active_account, active_account_attachments_dir, active_account_dir, app_database_path,
};
use crate::error::AppError;
use serde::Serialize;
use tauri::{AppHandle, Manager};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppStatus {
    version: String,
    app_database_path: String,
    account_path: String,
    database_path: String,
    attachments_path: String,
    themes_path: String,
    active_npub: String,
}

#[tauri::command]
pub fn app_status(app: AppHandle) -> Result<AppStatus, AppError> {
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
pub fn reveal_main_window(app: AppHandle) -> Result<(), AppError> {
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
pub fn get_attachments_dir(app: AppHandle) -> Result<String, AppError> {
    crate::adapters::filesystem::attachments::get_attachments_dir(&app)
}

#[tauri::command]
pub fn import_image(
    app: AppHandle,
    source_path: String,
) -> Result<crate::adapters::filesystem::attachments::ImportedImage, AppError> {
    crate::adapters::filesystem::attachments::import_image(&app, &source_path)
}

#[tauri::command]
pub fn import_image_bytes(
    app: AppHandle,
    bytes: Vec<u8>,
) -> Result<crate::adapters::filesystem::attachments::ImportedImage, AppError> {
    crate::adapters::filesystem::attachments::import_image_bytes(&app, &bytes)
}

#[tauri::command]
pub fn list_themes(app: AppHandle) -> Result<Vec<crate::infra::themes::ThemeSummary>, AppError> {
    crate::infra::themes::list_themes(&app)
}

#[tauri::command]
pub fn read_theme(
    app: AppHandle,
    theme_id: String,
) -> Result<crate::infra::themes::ThemeData, AppError> {
    crate::infra::themes::read_theme(&app, &theme_id)
}

#[tauri::command]
pub fn get_tag_index_diagnostics(
    app: AppHandle,
) -> Result<crate::adapters::sqlite::tag_index::TagIndexDiagnostics, AppError> {
    let conn = crate::db::database_connection(&app)?;
    crate::adapters::sqlite::tag_index::tag_index_diagnostics(&conn)
}

#[tauri::command]
pub fn repair_tag_index(
    app: AppHandle,
) -> Result<crate::adapters::sqlite::tag_index::TagIndexDiagnostics, AppError> {
    let mut conn = crate::db::database_connection(&app)?;
    crate::adapters::sqlite::tag_index::repair_tag_index(&mut conn)
}

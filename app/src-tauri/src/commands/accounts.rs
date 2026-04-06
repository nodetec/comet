use crate::adapters::nostr::sync_manager::SyncManager;
use crate::db;
use crate::domain::accounts::model::{AccountSummary, SecretStorageStatus};
use crate::error::AppError;
use tauri::{AppHandle, Manager};

async fn run_account_change<T>(
    app: &AppHandle,
    change: impl FnOnce() -> Result<T, AppError>,
) -> Result<T, AppError> {
    let manager = app.state::<SyncManager>();
    manager.stop().await;

    let result = change();
    crate::adapters::nostr::sync_manager::auto_start(app).await;
    result
}

#[tauri::command]
pub fn list_accounts(app: AppHandle) -> Result<Vec<AccountSummary>, AppError> {
    db::list_accounts(&app)
}

#[tauri::command]
pub fn get_account_nsec(app: AppHandle, public_key: String) -> Result<String, AppError> {
    db::get_account_nsec(&app, &public_key)
}

#[tauri::command]
pub fn get_secret_storage_status(app: AppHandle) -> Result<SecretStorageStatus, AppError> {
    db::current_secret_storage_status(&app)
}

#[tauri::command]
pub async fn move_secret_to_keychain(app: AppHandle) -> Result<SecretStorageStatus, AppError> {
    run_account_change(&app, || db::move_current_account_nsec_to_keychain(&app)).await
}

#[tauri::command]
pub async fn add_account(
    app: AppHandle,
    nsec: String,
    store_in_keychain: bool,
) -> Result<AccountSummary, AppError> {
    run_account_change(&app, || db::add_account(&app, &nsec, store_in_keychain)).await
}

#[tauri::command]
pub async fn switch_account(
    app: AppHandle,
    public_key: String,
) -> Result<AccountSummary, AppError> {
    run_account_change(&app, || db::switch_account(&app, &public_key)).await
}

#[tauri::command]
pub fn rename_account(app: AppHandle, public_key: String, name: String) -> Result<(), AppError> {
    db::rename_account(&app, &public_key, &name)
}

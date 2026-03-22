use crate::adapters::nostr::sync_manager::SyncManager;
use crate::db;
use crate::domain::accounts::model::AccountSummary;
use crate::error::AppError;
use crate::infra::cache::RenderedHtmlCache;
use tauri::{AppHandle, Manager};

async fn run_account_change<T>(
    app: &AppHandle,
    change: impl FnOnce() -> Result<T, AppError>,
) -> Result<T, AppError> {
    let manager = app.state::<SyncManager>();
    manager.stop().await;

    let result = change();
    if result.is_ok() {
        let cache = app.state::<RenderedHtmlCache>();
        cache.clear();
    }
    crate::adapters::nostr::sync_manager::auto_start(app).await;
    result
}

#[tauri::command]
pub fn list_accounts(app: AppHandle) -> Result<Vec<AccountSummary>, AppError> {
    db::list_accounts(&app)
}

#[tauri::command]
pub fn get_account_nsec(app: AppHandle, public_key: String) -> Result<String, AppError> {
    let account_exists = db::list_accounts(&app)?
        .into_iter()
        .any(|account| account.public_key == public_key);
    if !account_exists {
        return Err(AppError::custom(format!("Unknown account: {public_key}")));
    }

    crate::adapters::tauri::key_store::load_account_nsec(&app, &public_key)
}

#[tauri::command]
pub async fn add_account(app: AppHandle, nsec: String) -> Result<AccountSummary, AppError> {
    run_account_change(&app, || db::add_account(&app, &nsec)).await
}

#[tauri::command]
pub async fn switch_account(
    app: AppHandle,
    public_key: String,
) -> Result<AccountSummary, AppError> {
    run_account_change(&app, || db::switch_account(&app, &public_key)).await
}

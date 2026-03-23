use crate::adapters::sqlite::migrations::{account_migrations, app_migrations};
use crate::app_state::AppState;
use crate::domain::accounts::error::AccountError;
use crate::domain::accounts::model::AccountRecord;
use crate::error::AppError;
use rusqlite::{Connection, OptionalExtension};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::fs;

pub const APP_DATABASE_FILE: &str = "app.db";
pub const ACCOUNT_DATABASE_FILE: &str = "comet.db";
pub const ACCOUNTS_DIR: &str = "accounts";
const ATTACHMENTS_DIR: &str = "attachments";

/// Run migrations. Call once at app startup.
pub fn init_database(state: &Arc<AppState>) -> Result<(), AppError> {
    let _ = ensure_active_account(state)?;
    Ok(())
}

pub fn database_connection(state: &Arc<AppState>) -> Result<Connection, AppError> {
    let account = ensure_active_account(state)?;
    let conn = Connection::open(account.db_path)?;
    conn.execute_batch("PRAGMA foreign_keys = ON;")?;
    Ok(conn)
}

pub fn app_database_connection(state: &Arc<AppState>) -> Result<Connection, AppError> {
    let app_db_path = app_database_path(state)?;
    let mut conn = Connection::open(app_db_path)?;
    app_migrations().to_latest(&mut conn)?;
    normalize_account_db_paths(&conn)?;
    conn.execute_batch("PRAGMA foreign_keys = ON;")?;
    Ok(conn)
}

pub fn app_database_path(state: &Arc<AppState>) -> Result<PathBuf, AppError> {
    let root = app_data_dir(state)?;
    Ok(root.join(APP_DATABASE_FILE))
}

pub fn active_account(state: &Arc<AppState>) -> Result<AccountRecord, AppError> {
    ensure_active_account(state)
}

pub fn active_account_dir(state: &Arc<AppState>) -> Result<PathBuf, AppError> {
    let account = ensure_active_account(state)?;
    account
        .db_path
        .parent()
        .map(Path::to_path_buf)
        .ok_or_else(|| {
            AccountError::Storage("Account database path has no parent directory".into()).into()
        })
}

pub fn active_account_attachments_dir(state: &Arc<AppState>) -> Result<PathBuf, AppError> {
    let dir = active_account_dir(state)?.join(ATTACHMENTS_DIR);
    fs::create_dir_all(&dir)?;
    Ok(dir)
}

fn ensure_active_account(state: &Arc<AppState>) -> Result<AccountRecord, AppError> {
    let mut app_conn = app_database_connection(state)?;

    if let Some(active) = load_active_account(state, &app_conn)? {
        ensure_account_database_ready(&active)?;
        return Ok(active);
    }

    let has_accounts = conn_has_accounts(&app_conn)?;
    if has_accounts {
        return Err(AccountError::NoActiveAccount.into());
    }

    let account = crate::domain::accounts::service::create_initial_account(state, &mut app_conn)?;

    ensure_account_database_ready(&account)?;
    Ok(account)
}

pub fn ensure_account_database_ready(account: &AccountRecord) -> Result<(), AppError> {
    let parent = account.db_path.parent().ok_or_else(|| {
        AccountError::Storage("Account database path has no parent directory".into())
    })?;
    fs::create_dir_all(parent)?;
    if !account.db_path.exists() {
        // Create the database file if it doesn't exist yet
        let mut conn = Connection::open(&account.db_path)?;
        account_migrations().to_latest(&mut conn)?;
        return Ok(());
    }
    let mut conn = Connection::open(&account.db_path)?;
    account_migrations().to_latest(&mut conn)?;
    Ok(())
}

fn load_active_account(
    state: &Arc<AppState>,
    conn: &Connection,
) -> Result<Option<AccountRecord>, AppError> {
    let row: Option<(String, String)> = conn
        .query_row(
            "SELECT public_key, npub FROM accounts WHERE is_active = 1 LIMIT 1",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()?;

    row.map(|(public_key, npub)| {
        Ok(AccountRecord {
            db_path: account_db_path(state, &npub)?,
            public_key,
            npub,
        })
    })
    .transpose()
}

fn conn_has_accounts(conn: &Connection) -> Result<bool, AppError> {
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM accounts", [], |row| row.get(0))?;
    Ok(count > 0)
}

fn normalize_account_db_paths(conn: &Connection) -> Result<(), AppError> {
    let sql = format!(
        "UPDATE accounts
         SET db_path = '{ACCOUNTS_DIR}/' || npub || '/{ACCOUNT_DATABASE_FILE}'
         WHERE db_path <> '{ACCOUNTS_DIR}/' || npub || '/{ACCOUNT_DATABASE_FILE}'"
    );
    conn.execute(&sql, [])?;
    Ok(())
}

pub fn app_data_dir(state: &Arc<AppState>) -> Result<PathBuf, AppError> {
    let dir = &state.base_dir;
    fs::create_dir_all(dir)?;
    Ok(dir.clone())
}

pub fn accounts_root_dir(state: &Arc<AppState>) -> Result<PathBuf, AppError> {
    let dir = app_data_dir(state)?.join(ACCOUNTS_DIR);
    fs::create_dir_all(&dir)?;
    Ok(dir)
}

pub fn account_db_relative_path_string(npub: &str) -> String {
    format!("{ACCOUNTS_DIR}/{npub}/{ACCOUNT_DATABASE_FILE}")
}

pub fn account_db_path(state: &Arc<AppState>, npub: &str) -> Result<PathBuf, AppError> {
    Ok(app_data_dir(state)?.join(account_db_relative_path_string(npub)))
}

pub fn account_dir_for_npub(state: &Arc<AppState>, npub: &str) -> Result<PathBuf, AppError> {
    Ok(accounts_root_dir(state)?.join(npub))
}

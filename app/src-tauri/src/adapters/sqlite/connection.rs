use crate::adapters::sqlite::migrations::{account_migrations, app_migrations};
use crate::domain::accounts::error::AccountError;
use crate::domain::accounts::model::AccountRecord;
use crate::error::AppError;
use rusqlite::{Connection, OptionalExtension};
use std::{
    fs,
    path::{Path, PathBuf},
};
use tauri::{AppHandle, Manager};

pub(crate) const APP_DATABASE_FILE: &str = "app.db";
pub(crate) const ACCOUNT_DATABASE_FILE: &str = "comet.db";
pub(crate) const ACCOUNTS_DIR: &str = "accounts";
const ATTACHMENTS_DIR: &str = "attachments";

/// Run migrations. Call once at app startup.
pub fn init_database(app: &AppHandle) -> Result<(), AppError> {
    let _ = ensure_active_account(app)?;
    Ok(())
}

pub fn database_connection(app: &AppHandle) -> Result<Connection, AppError> {
    let account = ensure_active_account(app)?;
    let conn = Connection::open(account.db_path)?;
    conn.execute_batch("PRAGMA foreign_keys = ON;")?;
    Ok(conn)
}

pub fn app_database_connection(app: &AppHandle) -> Result<Connection, AppError> {
    let app_db_path = app_database_path(app)?;
    let mut conn = Connection::open(app_db_path)?;
    app_migrations().to_latest(&mut conn)?;
    normalize_account_db_paths(&conn)?;
    conn.execute_batch("PRAGMA foreign_keys = ON;")?;
    Ok(conn)
}

pub fn app_database_path(app: &AppHandle) -> Result<PathBuf, AppError> {
    let root = app_data_dir(app)?;
    Ok(root.join(APP_DATABASE_FILE))
}

pub fn active_account(app: &AppHandle) -> Result<AccountRecord, AppError> {
    ensure_active_account(app)
}

pub fn active_account_dir(app: &AppHandle) -> Result<PathBuf, AppError> {
    let account = ensure_active_account(app)?;
    account
        .db_path
        .parent()
        .map(Path::to_path_buf)
        .ok_or_else(|| {
            AccountError::Storage("Account database path has no parent directory".into()).into()
        })
}

pub fn active_account_attachments_dir(app: &AppHandle) -> Result<PathBuf, AppError> {
    let dir = active_account_dir(app)?.join(ATTACHMENTS_DIR);
    fs::create_dir_all(&dir)?;
    Ok(dir)
}

fn ensure_active_account(app: &AppHandle) -> Result<AccountRecord, AppError> {
    let mut app_conn = app_database_connection(app)?;

    if let Some(active) = load_active_account(app, &app_conn)? {
        ensure_account_database_ready(&active)?;
        return Ok(active);
    }

    let has_accounts = conn_has_accounts(&app_conn)?;
    if has_accounts {
        return Err(AccountError::NoActiveAccount.into());
    }

    let account = crate::domain::accounts::service::create_initial_account(app, &mut app_conn)?;

    ensure_account_database_ready(&account)?;
    Ok(account)
}

pub(crate) fn ensure_account_database_ready(account: &AccountRecord) -> Result<(), AppError> {
    let parent = account.db_path.parent().ok_or_else(|| {
        AccountError::Storage("Account database path has no parent directory".into())
    })?;
    fs::create_dir_all(parent)?;
    if !account.db_path.exists() {
        return Err(AccountError::DatabaseMissing(account.db_path.display().to_string()).into());
    }
    let mut conn = Connection::open(&account.db_path)?;
    account_migrations().to_latest(&mut conn)?;
    crate::adapters::sqlite::tag_index::ensure_tag_index_ready(&mut conn)?;
    Ok(())
}

fn load_active_account(
    app: &AppHandle,
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
            db_path: account_db_path(app, &npub)?,
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

pub(crate) fn app_data_dir(app: &AppHandle) -> Result<PathBuf, AppError> {
    let config_directory = app.path().app_config_dir()?;
    fs::create_dir_all(&config_directory)?;
    Ok(config_directory)
}

pub(crate) fn accounts_root_dir(app: &AppHandle) -> Result<PathBuf, AppError> {
    let dir = app_data_dir(app)?.join(ACCOUNTS_DIR);
    fs::create_dir_all(&dir)?;
    Ok(dir)
}

pub(crate) fn account_db_relative_path_string(npub: &str) -> String {
    format!("{ACCOUNTS_DIR}/{npub}/{ACCOUNT_DATABASE_FILE}")
}

pub(crate) fn account_db_path(app: &AppHandle, npub: &str) -> Result<PathBuf, AppError> {
    Ok(app_data_dir(app)?.join(account_db_relative_path_string(npub)))
}

pub(crate) fn account_dir_for_npub(app: &AppHandle, npub: &str) -> Result<PathBuf, AppError> {
    Ok(accounts_root_dir(app)?.join(npub))
}

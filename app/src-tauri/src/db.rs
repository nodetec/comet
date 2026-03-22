use crate::adapters::sqlite::migrations::{account_migrations, app_migrations};
use crate::domain::accounts::model::{AccountRecord, AccountSummary};
use crate::{
    error::{now_millis, AppError},
    nostr, secure_storage,
};
use rusqlite::{params, Connection, OptionalExtension};
use std::{
    fs,
    path::{Path, PathBuf},
};
use tauri::{AppHandle, Manager};

const APP_DATABASE_FILE: &str = "app.db";
const ACCOUNT_DATABASE_FILE: &str = "comet.db";
const ACCOUNTS_DIR: &str = "accounts";
const ATTACHMENTS_DIR: &str = "attachments";
const STAGED_ACCOUNT_PREFIX: &str = ".staged-account-";

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
        .ok_or_else(|| AppError::custom("Account database path has no parent directory"))
}

pub fn active_account_attachments_dir(app: &AppHandle) -> Result<PathBuf, AppError> {
    let dir = active_account_dir(app)?.join(ATTACHMENTS_DIR);
    fs::create_dir_all(&dir)?;
    Ok(dir)
}

pub fn list_accounts(app: &AppHandle) -> Result<Vec<AccountSummary>, AppError> {
    let conn = app_database_connection(app)?;
    let mut stmt = conn.prepare(
        "SELECT public_key, npub, is_active
         FROM accounts
         ORDER BY is_active DESC, created_at ASC",
    )?;
    let rows = stmt
        .query_map([], |row| {
            Ok(AccountSummary {
                public_key: row.get(0)?,
                npub: row.get(1)?,
                is_active: row.get::<_, i64>(2)? != 0,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

pub fn add_account(app: &AppHandle, nsec: &str) -> Result<AccountSummary, AppError> {
    let staged_dir = staged_account_dir(app)?;
    fs::create_dir_all(&staged_dir)?;
    let staged_db_path = staged_dir.join(ACCOUNT_DATABASE_FILE);
    let mut moved_target_dir: Option<PathBuf> = None;
    let mut stored_key_public_key: Option<String> = None;

    let creation_result = (|| -> Result<AccountSummary, AppError> {
        let mut account_conn = Connection::open(&staged_db_path)?;
        account_migrations().to_latest(&mut account_conn)?;
        let identity = nostr::import_nsec(&account_conn, nsec)?;
        nostr::ensure_default_settings(&account_conn)?;

        let mut account = account_identity_record(&account_conn, &staged_db_path)?
            .ok_or_else(|| AppError::custom("Failed to initialize account identity"))?;
        drop(account_conn);

        let mut app_conn = app_database_connection(app)?;
        ensure_account_not_registered(&app_conn, &identity.public_key, &identity.npub)?;

        let target_dir = account_dir_for_npub(app, &account.npub)?;
        if target_dir.exists() {
            return Err(AppError::custom(format!(
                "Account workspace already exists at {}. Restore or relink that workspace instead of adding this account again.",
                target_dir.display()
            )));
        }

        fs::rename(&staged_dir, &target_dir)?;
        moved_target_dir = Some(target_dir.clone());
        secure_storage::store_account_nsec(app, &account.public_key, &identity.nsec)?;
        stored_key_public_key = Some(account.public_key.clone());
        account.db_path = target_dir.join(ACCOUNT_DATABASE_FILE);
        register_account(&mut app_conn, &account, None, true)?;

        Ok(AccountSummary {
            public_key: account.public_key,
            npub: account.npub,
            is_active: true,
        })
    })();

    if creation_result.is_err() && staged_dir.exists() {
        let _ = fs::remove_dir_all(&staged_dir);
    }
    if creation_result.is_err() {
        if let Some(target_dir) = moved_target_dir.filter(|dir| dir.exists()) {
            let _ = fs::remove_dir_all(target_dir);
        }
        if let Some(public_key) = stored_key_public_key.as_deref() {
            secure_storage::remove_account_nsec(app, public_key);
        }
    }

    creation_result
}

pub fn switch_account(app: &AppHandle, public_key: &str) -> Result<AccountSummary, AppError> {
    let mut conn = app_database_connection(app)?;
    let account = load_account_record_by_public_key(app, &conn, public_key)?
        .ok_or_else(|| AppError::custom(format!("Unknown account: {public_key}")))?;
    ensure_account_database_ready(&account)?;
    set_active_account(&mut conn, public_key)?;
    Ok(AccountSummary {
        public_key: account.public_key,
        npub: account.npub,
        is_active: true,
    })
}


fn ensure_active_account(app: &AppHandle) -> Result<AccountRecord, AppError> {
    let mut app_conn = app_database_connection(app)?;

    if let Some(active) = load_active_account(app, &app_conn)? {
        ensure_account_database_ready(&active)?;
        return Ok(active);
    }

    let has_accounts = conn_has_accounts(&app_conn)?;
    if has_accounts {
        return Err(AppError::custom("No active account configured."));
    }

    let account = create_initial_account(app, &mut app_conn)?;

    ensure_account_database_ready(&account)?;
    Ok(account)
}

fn ensure_account_database_ready(account: &AccountRecord) -> Result<(), AppError> {
    let parent = account
        .db_path
        .parent()
        .ok_or_else(|| AppError::custom("Account database path has no parent directory"))?;
    fs::create_dir_all(parent)?;
    if !account.db_path.exists() {
        return Err(AppError::custom(format!(
            "Account database is missing: {}",
            account.db_path.display()
        )));
    }
    let mut conn = Connection::open(&account.db_path)?;
    account_migrations().to_latest(&mut conn)?;
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

fn load_account_record_by_public_key(
    app: &AppHandle,
    conn: &Connection,
    public_key: &str,
) -> Result<Option<AccountRecord>, AppError> {
    let row: Option<(String, String)> = conn
        .query_row(
            "SELECT public_key, npub FROM accounts WHERE public_key = ?1 LIMIT 1",
            params![public_key],
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

fn set_active_account(conn: &mut Connection, public_key: &str) -> Result<(), AppError> {
    let tx = conn.transaction()?;
    tx.execute("UPDATE accounts SET is_active = 0 WHERE is_active = 1", [])?;
    let changed = tx.execute(
        "UPDATE accounts SET is_active = 1, updated_at = ?1 WHERE public_key = ?2",
        params![now_millis(), public_key],
    )?;
    if changed == 0 {
        return Err(AppError::custom(format!("Unknown account: {public_key}")));
    }
    tx.commit()?;
    Ok(())
}

fn register_account(
    conn: &mut Connection,
    account: &AccountRecord,
    label: Option<&str>,
    active: bool,
) -> Result<(), AppError> {
    let now = now_millis();
    let db_path = account_db_relative_path_string(&account.npub);
    let tx = conn.transaction()?;
    if active {
        tx.execute("UPDATE accounts SET is_active = 0 WHERE is_active = 1", [])?;
    }
    tx.execute(
        "INSERT INTO accounts (public_key, npub, label, db_path, created_at, updated_at, is_active)
         VALUES (?1, ?2, ?3, ?4, ?5, ?5, ?6)
         ON CONFLICT(public_key) DO UPDATE SET
           npub = excluded.npub,
           label = excluded.label,
           db_path = excluded.db_path,
           updated_at = excluded.updated_at,
           is_active = excluded.is_active",
        params![
            account.public_key.as_str(),
            account.npub.as_str(),
            label,
            db_path,
            now,
            i32::from(active),
        ],
    )?;
    tx.commit()?;
    Ok(())
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

fn ensure_account_not_registered(
    conn: &Connection,
    public_key: &str,
    npub: &str,
) -> Result<(), AppError> {
    let existing_pubkey: Option<String> = conn
        .query_row(
            "SELECT public_key FROM accounts WHERE public_key = ?1 LIMIT 1",
            params![public_key],
            |row| row.get(0),
        )
        .optional()?;
    if existing_pubkey.is_some() {
        return Err(AppError::custom(format!(
            "Account already exists for pubkey {public_key}. Switch to it instead."
        )));
    }

    let existing_npub: Option<String> = conn
        .query_row(
            "SELECT public_key FROM accounts WHERE npub = ?1 LIMIT 1",
            params![npub],
            |row| row.get(0),
        )
        .optional()?;
    if existing_npub.is_some() {
        return Err(AppError::custom(format!(
            "Account already exists for npub {npub}. Switch to it instead."
        )));
    }

    Ok(())
}

fn create_initial_account(
    app: &AppHandle,
    app_conn: &mut Connection,
) -> Result<AccountRecord, AppError> {
    let staged_dir = staged_account_dir(app)?;
    fs::create_dir_all(&staged_dir)?;
    let mut moved_target_dir: Option<PathBuf> = None;
    let mut stored_key_public_key: Option<String> = None;

    let creation_result = (|| -> Result<AccountRecord, AppError> {
        let staged_db_path = staged_dir.join(ACCOUNT_DATABASE_FILE);
        let mut account_conn = Connection::open(&staged_db_path)?;
        account_migrations().to_latest(&mut account_conn)?;
        let identity = nostr::create_identity(&account_conn)?;

        let mut account = account_identity_record(&account_conn, &staged_db_path)?
            .ok_or_else(|| AppError::custom("Failed to initialize account identity"))?;
        drop(account_conn);

        let target_dir = account_dir_for_npub(app, &account.npub)?;
        if target_dir.exists() {
            return Err(AppError::custom(format!(
                "Cannot create account in existing directory: {}",
                target_dir.display()
            )));
        }
        fs::rename(&staged_dir, &target_dir)?;
        moved_target_dir = Some(target_dir.clone());

        secure_storage::store_account_nsec(app, &account.public_key, &identity.nsec)?;
        stored_key_public_key = Some(account.public_key.clone());

        account.db_path = target_dir.join(ACCOUNT_DATABASE_FILE);
        register_account(app_conn, &account, None, true)?;
        Ok(account)
    })();

    if creation_result.is_err() && staged_dir.exists() {
        let _ = fs::remove_dir_all(&staged_dir);
    }
    if creation_result.is_err() {
        if let Some(target_dir) = moved_target_dir.filter(|dir| dir.exists()) {
            let _ = fs::remove_dir_all(target_dir);
        }
        if let Some(public_key) = stored_key_public_key.as_deref() {
            secure_storage::remove_account_nsec(app, public_key);
        }
    }

    creation_result
}

fn account_identity_record(
    conn: &Connection,
    db_path: &Path,
) -> Result<Option<AccountRecord>, AppError> {
    conn.query_row(
        "SELECT public_key, npub FROM nostr_identity LIMIT 1",
        [],
        |row| {
            Ok(AccountRecord {
                public_key: row.get(0)?,
                npub: row.get(1)?,
                db_path: db_path.to_path_buf(),
            })
        },
    )
    .optional()
    .map_err(Into::into)
}

fn app_data_dir(app: &AppHandle) -> Result<PathBuf, AppError> {
    let config_directory = app.path().app_config_dir()?;
    fs::create_dir_all(&config_directory)?;
    Ok(config_directory)
}

fn accounts_root_dir(app: &AppHandle) -> Result<PathBuf, AppError> {
    let dir = app_data_dir(app)?.join(ACCOUNTS_DIR);
    fs::create_dir_all(&dir)?;
    Ok(dir)
}

fn account_db_relative_path_string(npub: &str) -> String {
    format!("{ACCOUNTS_DIR}/{npub}/{ACCOUNT_DATABASE_FILE}")
}

fn account_db_path(app: &AppHandle, npub: &str) -> Result<PathBuf, AppError> {
    Ok(app_data_dir(app)?.join(account_db_relative_path_string(npub)))
}

fn account_dir_for_npub(app: &AppHandle, npub: &str) -> Result<PathBuf, AppError> {
    Ok(accounts_root_dir(app)?.join(npub))
}

fn staged_account_dir(app: &AppHandle) -> Result<PathBuf, AppError> {
    Ok(accounts_root_dir(app)?.join(format!("{STAGED_ACCOUNT_PREFIX}{}", now_millis())))
}

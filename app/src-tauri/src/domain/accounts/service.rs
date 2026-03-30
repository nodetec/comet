use crate::adapters::sqlite::connection::{
    account_db_path, account_db_relative_path_string, account_dir_for_npub, accounts_root_dir,
    app_database_connection, ensure_account_database_ready, ACCOUNT_DATABASE_FILE,
};
use crate::adapters::sqlite::identity_repository as nostr;
use crate::domain::accounts::error::AccountError;
use crate::domain::accounts::model::{AccountRecord, AccountSummary, SecretStorageStatus};
use crate::domain::common::time::now_millis;
use crate::error::AppError;
use rusqlite::{params, Connection, OptionalExtension};
use std::{fs, path::Path, path::PathBuf};
use tauri::AppHandle;

const STAGED_ACCOUNT_PREFIX: &str = ".staged-account-";

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

pub fn add_account(
    app: &AppHandle,
    nsec: &str,
    store_in_keychain: bool,
) -> Result<AccountSummary, AppError> {
    let staged_dir = staged_account_dir(app)?;
    fs::create_dir_all(&staged_dir)?;
    let staged_db_path = staged_dir.join(ACCOUNT_DATABASE_FILE);
    let mut moved_target_dir: Option<PathBuf> = None;
    let mut stored_key_public_key: Option<String> = None;

    let creation_result = (|| -> Result<AccountSummary, AppError> {
        let mut account_conn = Connection::open(&staged_db_path)?;
        crate::adapters::sqlite::migrations::account_migrations().to_latest(&mut account_conn)?;
        let identity = nostr::import_nsec(&account_conn, nsec)?;
        nostr::ensure_default_settings(&account_conn)?;
        nostr::set_nsec_storage(
            &account_conn,
            if store_in_keychain {
                nostr::NSEC_STORAGE_KEYCHAIN
            } else {
                nostr::NSEC_STORAGE_DATABASE
            },
        )?;

        let mut account = account_identity_record(&account_conn, &staged_db_path)?.ok_or(
            AccountError::Storage("Failed to initialize account identity".into()),
        )?;
        if store_in_keychain {
            crate::adapters::tauri::key_store::store_account_nsec(
                app,
                &account.public_key,
                &identity.nsec,
            )?;
            stored_key_public_key = Some(account.public_key.clone());
            nostr::clear_stored_nsec(&account_conn)?;
        }
        drop(account_conn);

        let mut app_conn = app_database_connection(app)?;
        ensure_account_not_registered(&app_conn, &identity.public_key, &identity.npub)?;

        let target_dir = account_dir_for_npub(app, &account.npub)?;
        if target_dir.exists() {
            return Err(AccountError::AlreadyExists(format!(
                "Account workspace already exists at {}. Restore or relink that workspace instead of adding this account again.",
                target_dir.display()
            ))
            .into());
        }

        fs::rename(&staged_dir, &target_dir)?;
        moved_target_dir = Some(target_dir.clone());
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
            crate::adapters::tauri::key_store::remove_account_nsec(app, public_key);
        }
    }

    creation_result
}

pub fn switch_account(app: &AppHandle, public_key: &str) -> Result<AccountSummary, AppError> {
    let mut conn = app_database_connection(app)?;
    let account =
        load_account_record_by_public_key(app, &conn, public_key)?.ok_or(AccountError::NotFound)?;
    ensure_account_database_ready(&account)?;
    set_active_account(&mut conn, public_key)?;
    Ok(AccountSummary {
        public_key: account.public_key,
        npub: account.npub,
        is_active: true,
    })
}

pub fn get_account_nsec(app: &AppHandle, public_key: &str) -> Result<String, AppError> {
    let conn = app_database_connection(app)?;
    let account =
        load_account_record_by_public_key(app, &conn, public_key)?.ok_or(AccountError::NotFound)?;
    ensure_account_database_ready(&account)?;
    let account_conn = Connection::open(&account.db_path)?;

    if let Some(nsec) = nostr::get_stored_nsec(&account_conn)? {
        return Ok(nsec);
    }

    crate::adapters::tauri::key_store::load_account_nsec(app, public_key)
}

pub fn current_secret_storage_status(app: &AppHandle) -> Result<SecretStorageStatus, AppError> {
    let account = crate::adapters::sqlite::connection::active_account(app)?;
    let conn = Connection::open(&account.db_path)?;
    let storage = nostr::get_nsec_storage(&conn)?.unwrap_or_else(|| {
        match nostr::get_stored_nsec(&conn) {
            Ok(Some(_)) => nostr::NSEC_STORAGE_DATABASE.to_string(),
            _ => nostr::NSEC_STORAGE_KEYCHAIN.to_string(),
        }
    });

    Ok(SecretStorageStatus { storage })
}

pub fn move_current_account_nsec_to_keychain(
    app: &AppHandle,
) -> Result<SecretStorageStatus, AppError> {
    let account = crate::adapters::sqlite::connection::active_account(app)?;
    let conn = Connection::open(&account.db_path)?;
    let Some(nsec) = nostr::get_stored_nsec(&conn)? else {
        nostr::set_nsec_storage(&conn, nostr::NSEC_STORAGE_KEYCHAIN)?;
        return Ok(SecretStorageStatus {
            storage: nostr::NSEC_STORAGE_KEYCHAIN.to_string(),
        });
    };

    crate::adapters::tauri::key_store::store_account_nsec(app, &account.public_key, &nsec)?;
    nostr::clear_stored_nsec(&conn)?;
    nostr::set_nsec_storage(&conn, nostr::NSEC_STORAGE_KEYCHAIN)?;

    Ok(SecretStorageStatus {
        storage: nostr::NSEC_STORAGE_KEYCHAIN.to_string(),
    })
}

pub(crate) fn create_initial_account(
    app: &AppHandle,
    app_conn: &mut Connection,
) -> Result<AccountRecord, AppError> {
    let staged_dir = staged_account_dir(app)?;
    fs::create_dir_all(&staged_dir)?;
    let mut moved_target_dir: Option<PathBuf> = None;

    let creation_result = (|| -> Result<AccountRecord, AppError> {
        let staged_db_path = staged_dir.join(ACCOUNT_DATABASE_FILE);
        let mut account_conn = Connection::open(&staged_db_path)?;
        crate::adapters::sqlite::migrations::account_migrations().to_latest(&mut account_conn)?;
        let _identity = nostr::create_identity(&account_conn)?;
        nostr::set_nsec_storage(&account_conn, nostr::NSEC_STORAGE_DATABASE)?;

        let mut account = account_identity_record(&account_conn, &staged_db_path)?.ok_or(
            AccountError::Storage("Failed to initialize account identity".into()),
        )?;
        drop(account_conn);

        let target_dir = account_dir_for_npub(app, &account.npub)?;
        if target_dir.exists() {
            return Err(AccountError::AlreadyExists(format!(
                "Cannot create account in existing directory: {}",
                target_dir.display()
            ))
            .into());
        }
        fs::rename(&staged_dir, &target_dir)?;
        moved_target_dir = Some(target_dir.clone());

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
    }

    creation_result
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

fn set_active_account(conn: &mut Connection, public_key: &str) -> Result<(), AppError> {
    let tx = conn.transaction()?;
    tx.execute("UPDATE accounts SET is_active = 0 WHERE is_active = 1", [])?;
    let changed = tx.execute(
        "UPDATE accounts SET is_active = 1, updated_at = ?1 WHERE public_key = ?2",
        params![now_millis(), public_key],
    )?;
    if changed == 0 {
        return Err(AccountError::NotFound.into());
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
        return Err(AccountError::AlreadyExists(format!(
            "Account already exists for pubkey {public_key}. Switch to it instead."
        ))
        .into());
    }

    let existing_npub: Option<String> = conn
        .query_row(
            "SELECT public_key FROM accounts WHERE npub = ?1 LIMIT 1",
            params![npub],
            |row| row.get(0),
        )
        .optional()?;
    if existing_npub.is_some() {
        return Err(AccountError::AlreadyExists(format!(
            "Account already exists for npub {npub}. Switch to it instead."
        ))
        .into());
    }

    Ok(())
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

fn staged_account_dir(app: &AppHandle) -> Result<PathBuf, AppError> {
    Ok(accounts_root_dir(app)?.join(format!("{STAGED_ACCOUNT_PREFIX}{}", now_millis())))
}

use crate::domain::accounts::model::IdentityCredentials;
use crate::domain::common::time::now_millis;
use crate::error::AppError;
use nostr_sdk::prelude::*;
use rusqlite::{params, Connection, OptionalExtension};

pub const DEFAULT_SYNC_RELAY: &str = "wss://relay.comet.md";
pub const DEFAULT_PUBLISH_RELAY: &str = "wss://relay.damus.io";
pub const DEFAULT_BLOSSOM_URL: &str = "https://media.comet.md";
pub const NSEC_STORAGE_APP_SETTING_KEY: &str = "nsec_storage";
pub const NSEC_STORAGE_DATABASE: &str = "database";
pub const NSEC_STORAGE_KEYCHAIN: &str = "keychain";

pub fn ensure_default_settings(conn: &Connection) -> Result<(), AppError> {
    let now = now_millis();
    conn.execute(
        "INSERT OR IGNORE INTO relays (url, kind, created_at) VALUES (?1, 'sync', ?2)",
        params![DEFAULT_SYNC_RELAY, now],
    )?;
    conn.execute(
        "INSERT OR IGNORE INTO relays (url, kind, created_at) VALUES (?1, 'publish', ?2)",
        params![DEFAULT_PUBLISH_RELAY, now],
    )?;
    conn.execute(
        "INSERT OR IGNORE INTO app_settings (key, value) VALUES ('blossom_url', ?1)",
        params![DEFAULT_BLOSSOM_URL],
    )?;
    Ok(())
}

fn insert_identity(conn: &Connection, keys: &Keys) -> Result<IdentityCredentials, AppError> {
    let npub = keys
        .public_key()
        .to_bech32()
        .map_err(|e| AppError::custom(e.to_string()))?;
    let nsec = keys
        .secret_key()
        .to_bech32()
        .map_err(|e| AppError::custom(e.to_string()))?;
    let public_key = keys.public_key().to_hex();
    let now = now_millis();

    conn.execute(
        "INSERT INTO nostr_identity (public_key, npub, nsec, created_at)
         VALUES (?1, ?2, ?3, ?4)",
        params![public_key, npub, nsec, now],
    )?;

    Ok(IdentityCredentials {
        public_key,
        npub,
        nsec,
    })
}

/// Generates a fresh keypair and stores only the public identity in SQLite.
/// On first launch, also sets up default relay and blossom server.
pub fn create_identity(conn: &Connection) -> Result<IdentityCredentials, AppError> {
    if let Some(npub) = get_npub(conn)? {
        return Err(AppError::custom(format!(
            "Nostr identity already configured for {npub}."
        )));
    }

    let keys = Keys::generate();
    let identity = insert_identity(conn, &keys)?;

    ensure_default_settings(conn)?;

    Ok(identity)
}

fn get_npub(conn: &Connection) -> Result<Option<String>, AppError> {
    conn.query_row("SELECT npub FROM nostr_identity LIMIT 1", [], |row| {
        row.get(0)
    })
    .optional()
    .map_err(Into::into)
}

/// Imports an nsec (bech32 or hex), replacing the existing identity.
pub fn import_nsec(conn: &Connection, nsec: &str) -> Result<IdentityCredentials, AppError> {
    let keys = Keys::parse(nsec).map_err(|e| AppError::custom(format!("Invalid key: {e}")))?;
    conn.execute("DELETE FROM nostr_identity", [])?;
    insert_identity(conn, &keys)
}

pub fn set_nsec_storage(conn: &Connection, storage: &str) -> Result<(), AppError> {
    conn.execute(
        "INSERT INTO app_settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![NSEC_STORAGE_APP_SETTING_KEY, storage],
    )?;
    Ok(())
}

pub fn get_nsec_storage(conn: &Connection) -> Result<Option<String>, AppError> {
    conn.query_row(
        "SELECT value FROM app_settings WHERE key = ?1 LIMIT 1",
        params![NSEC_STORAGE_APP_SETTING_KEY],
        |row| row.get(0),
    )
    .optional()
    .map_err(Into::into)
}

pub fn get_stored_nsec(conn: &Connection) -> Result<Option<String>, AppError> {
    conn.query_row("SELECT nsec FROM nostr_identity LIMIT 1", [], |row| {
        row.get::<_, Option<String>>(0)
    })
    .optional()
    .map(|value| value.flatten())
    .map_err(Into::into)
}

pub fn clear_stored_nsec(conn: &Connection) -> Result<(), AppError> {
    conn.execute("UPDATE nostr_identity SET nsec = NULL", [])?;
    Ok(())
}

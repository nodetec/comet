use crate::domain::accounts::model::IdentityCredentials;
use crate::domain::common::time::now_millis;
use crate::error::AppError;
use nostr_sdk::prelude::*;
use rusqlite::{params, Connection, OptionalExtension};

pub const DEFAULT_SYNC_RELAY: &str = "wss://relay.comet.md";
pub const DEFAULT_PUBLISH_RELAY: &str = "wss://relay.damus.io";
pub const DEFAULT_BLOSSOM_URL: &str = "https://blossom.comet.md";

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
        "INSERT INTO nostr_identity (public_key, npub, created_at)
         VALUES (?1, ?2, ?3)",
        params![public_key, npub, now],
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

pub fn current_npub(conn: &Connection) -> Result<String, AppError> {
    get_npub(conn)?.ok_or_else(|| AppError::custom("No Nostr identity configured."))
}

/// Imports an nsec (bech32 or hex), replacing the existing identity.
pub fn import_nsec(conn: &Connection, nsec: &str) -> Result<IdentityCredentials, AppError> {
    let keys = Keys::parse(nsec).map_err(|e| AppError::custom(format!("Invalid key: {e}")))?;
    conn.execute("DELETE FROM nostr_identity", [])?;
    insert_identity(conn, &keys)
}

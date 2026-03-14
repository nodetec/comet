use nostr_sdk::prelude::*;
use rusqlite::{params, Connection, OptionalExtension};
use std::time::{SystemTime, UNIX_EPOCH};

/// Returns the npub for the stored identity,
/// generating a new keypair if one does not exist yet.
pub fn ensure_identity(conn: &Connection) -> Result<String, String> {
    if let Some(npub) = get_npub(conn)? {
        return Ok(npub);
    }

    let keys = Keys::generate();
    let npub = keys.public_key().to_bech32().map_err(|e| e.to_string())?;
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis() as i64;

    conn.execute(
        "INSERT INTO nostr_identity (secret_key, public_key, npub, created_at)
         VALUES (?1, ?2, ?3, ?4)",
        params![
            keys.secret_key().to_secret_hex(),
            keys.public_key().to_hex(),
            npub,
            now,
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok(npub)
}

fn get_npub(conn: &Connection) -> Result<Option<String>, String> {
    conn.query_row("SELECT npub FROM nostr_identity LIMIT 1", [], |row| {
        row.get(0)
    })
    .optional()
    .map_err(|e| e.to_string())
}

/// Imports an nsec (bech32 or hex), replacing the existing identity.
/// Returns the new npub.
pub fn import_nsec(conn: &Connection, nsec: &str) -> Result<String, String> {
    let secret_key = SecretKey::parse(nsec).map_err(|e| format!("Invalid key: {e}"))?;
    let keys = Keys::new(secret_key);
    let npub = keys.public_key().to_bech32().map_err(|e| e.to_string())?;
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis() as i64;

    conn.execute("DELETE FROM nostr_identity", [])
        .map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO nostr_identity (secret_key, public_key, npub, created_at)
         VALUES (?1, ?2, ?3, ?4)",
        params![
            keys.secret_key().to_secret_hex(),
            keys.public_key().to_hex(),
            npub,
            now,
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok(npub)
}

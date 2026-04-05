use crate::adapters::sqlite::migrations::account_migrations;
use crate::domain::sync::snapshot_service::materialize_note_snapshot_locally;
use crate::domain::sync::vector_clock::{serialize_vector_clock, VectorClock};
use crate::error::AppError;
use nostr_sdk::prelude::Keys;
use rusqlite::{params, Connection, OptionalExtension};
use std::path::Path;
use uuid::Uuid;

const DEVICE_ID_KEY: &str = "sync_device_id";

pub fn seed_initial_note_snapshots(db_path: &Path, nsec: &str) -> Result<usize, AppError> {
    let keys =
        Keys::parse(nsec).map_err(|error| AppError::custom(format!("Invalid nsec: {error}")))?;
    let author_pubkey = keys.public_key();

    let mut conn = Connection::open(db_path)?;
    account_migrations().to_latest(&mut conn)?;
    conn.execute_batch("PRAGMA foreign_keys = ON;")?;
    let device_id = ensure_seed_device_id(&conn)?;
    let initial_vector_clock =
        serialize_vector_clock(&VectorClock::from([(device_id.clone(), 1_u64)]))
            .map_err(AppError::custom)?;
    conn.execute(
        "UPDATE notes
         SET last_edit_device_id = CASE
               WHEN COALESCE(last_edit_device_id, '') = '' THEN ?1
               ELSE last_edit_device_id
             END,
             vector_clock = CASE
               WHEN COALESCE(vector_clock, '') = '' OR vector_clock = '{}' THEN ?2
               ELSE vector_clock
             END",
        params![device_id, initial_vector_clock],
    )?;

    let mut stmt = conn.prepare(
        "SELECT id
         FROM notes
         WHERE id NOT IN (
           SELECT DISTINCT d_tag
           FROM sync_snapshots
           WHERE author_pubkey = ?1
         )
         ORDER BY created_at ASC, id ASC",
    )?;
    let rows = stmt.query_map(params![author_pubkey.to_hex()], |row| {
        row.get::<_, String>(0)
    })?;
    let note_ids = rows.collect::<Result<Vec<_>, _>>()?;
    drop(stmt);

    for note_id in &note_ids {
        materialize_note_snapshot_locally(&conn, &keys, &author_pubkey, note_id, true)?;
        conn.execute(
            "UPDATE notes
             SET locally_modified = CASE
               WHEN snapshot_event_id IS NULL THEN 1
               ELSE locally_modified
             END
             WHERE id = ?1",
            params![note_id],
        )?;
    }

    Ok(note_ids.len())
}

fn ensure_seed_device_id(conn: &Connection) -> Result<String, AppError> {
    let existing: Option<String> = conn
        .query_row(
            "SELECT value FROM app_settings WHERE key = ?1",
            params![DEVICE_ID_KEY],
            |row| row.get(0),
        )
        .optional()?;

    if let Some(device_id) = existing {
        if !device_id.trim().is_empty() {
            return Ok(device_id);
        }
    }

    let device_id = Uuid::new_v4().hyphenated().to_string().to_uppercase();
    conn.execute(
        "INSERT INTO app_settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![DEVICE_ID_KEY, device_id],
    )?;
    Ok(device_id)
}

use crate::adapters::sqlite::migrations::account_migrations;
use crate::domain::sync::revision_service::materialize_note_revision_locally;
use crate::error::AppError;
use nostr_sdk::prelude::Keys;
use rusqlite::{params, Connection};
use std::path::Path;

pub fn seed_initial_note_revisions(db_path: &Path, nsec: &str) -> Result<usize, AppError> {
    let keys =
        Keys::parse(nsec).map_err(|error| AppError::custom(format!("Invalid nsec: {error}")))?;
    let author_pubkey = keys.public_key();

    let mut conn = Connection::open(db_path)?;
    account_migrations().to_latest(&mut conn)?;
    conn.execute_batch("PRAGMA foreign_keys = ON;")?;

    let mut stmt = conn.prepare(
        "SELECT id
         FROM notes
         WHERE current_rev IS NULL
         ORDER BY created_at ASC, id ASC",
    )?;
    let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
    let note_ids = rows.collect::<Result<Vec<_>, _>>()?;
    drop(stmt);

    for note_id in &note_ids {
        materialize_note_revision_locally(&conn, &keys, &author_pubkey, note_id, true)?;
        conn.execute(
            "UPDATE notes
             SET locally_modified = CASE
               WHEN sync_event_id IS NULL THEN 1
               ELSE locally_modified
             END
             WHERE id = ?1",
            params![note_id],
        )?;
    }

    Ok(note_ids.len())
}

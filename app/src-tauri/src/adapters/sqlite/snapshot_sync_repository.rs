use crate::domain::common::time::now_millis;
use crate::error::AppError;
use rusqlite::{params, Connection, OptionalExtension};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SyncRelayState {
    pub relay_url: String,
    // Last applied `CHANGES` sequence for this relay. This advances during the
    // live subscription after bootstrap.
    pub checkpoint_seq: Option<i64>,
    // Bootstrap handoff boundary returned by `CHANGES STATUS.snapshot_seq`.
    // Live `CHANGES` starts from this boundary, but the value itself should
    // remain the bootstrap snapshot marker rather than being overwritten on
    // every live event.
    pub snapshot_seq: Option<i64>,
    pub last_synced_at: Option<i64>,
    pub min_payload_mtime: Option<i64>,
    pub updated_at: i64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LocalSyncSnapshot {
    pub author_pubkey: String,
    pub d_tag: String,
    pub snapshot_id: String,
    pub op: String,
    pub mtime: i64,
    pub entity_type: Option<String>,
    pub event_id: Option<String>,
    pub payload_retained: bool,
    pub relay_url: Option<String>,
    pub stored_seq: Option<i64>,
    pub created_at: i64,
}

pub fn add_sync_relay(conn: &Connection, relay_url: &str) -> Result<(), AppError> {
    conn.execute(
        "INSERT OR IGNORE INTO sync_relays (relay_url, created_at) VALUES (?1, ?2)",
        params![relay_url, now_millis()],
    )?;
    Ok(())
}

pub fn get_sync_relay_state(
    conn: &Connection,
    relay_url: &str,
) -> Result<Option<SyncRelayState>, AppError> {
    conn.query_row(
        "SELECT relay_url, checkpoint_seq, snapshot_seq, last_synced_at, min_payload_mtime, updated_at
         FROM sync_relay_state
         WHERE relay_url = ?1",
        params![relay_url],
        |row| {
            Ok(SyncRelayState {
                relay_url: row.get(0)?,
                checkpoint_seq: row.get(1)?,
                snapshot_seq: row.get(2)?,
                last_synced_at: row.get(3)?,
                min_payload_mtime: row.get(4)?,
                updated_at: row.get(5)?,
            })
        },
    )
    .optional()
    .map_err(Into::into)
}

pub fn upsert_sync_relay_state(
    conn: &Connection,
    relay_url: &str,
    checkpoint_seq: Option<i64>,
    snapshot_seq: Option<i64>,
    last_synced_at: Option<i64>,
    min_payload_mtime: Option<i64>,
) -> Result<(), AppError> {
    // This helper stores two distinct relay progress markers:
    //
    // - `snapshot_seq`: the bootstrap handoff boundary returned by CHANGES bootstrap
    // - `checkpoint_seq`: the last applied live `CHANGES` position
    //
    // Callers should preserve `snapshot_seq` once bootstrap has recorded it,
    // and only advance `checkpoint_seq` during live catch-up / streaming.
    add_sync_relay(conn, relay_url)?;
    conn.execute(
        "INSERT INTO sync_relay_state
           (relay_url, checkpoint_seq, snapshot_seq, last_synced_at, min_payload_mtime, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(relay_url) DO UPDATE SET
           checkpoint_seq = excluded.checkpoint_seq,
           snapshot_seq = excluded.snapshot_seq,
           last_synced_at = excluded.last_synced_at,
           min_payload_mtime = excluded.min_payload_mtime,
           updated_at = excluded.updated_at",
        params![
            relay_url,
            checkpoint_seq,
            snapshot_seq,
            last_synced_at,
            min_payload_mtime,
            now_millis()
        ],
    )?;
    Ok(())
}

pub fn upsert_sync_snapshot(
    conn: &Connection,
    snapshot: &LocalSyncSnapshot,
) -> Result<(), AppError> {
    conn.execute(
        "INSERT INTO sync_snapshots
           (author_pubkey, d_tag, snapshot_id, op, mtime, entity_type, event_id, payload_retained, relay_url, stored_seq, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
         ON CONFLICT(author_pubkey, d_tag, snapshot_id) DO UPDATE SET
           op = excluded.op,
           mtime = excluded.mtime,
           entity_type = excluded.entity_type,
           event_id = excluded.event_id,
           payload_retained = excluded.payload_retained,
           relay_url = excluded.relay_url,
           stored_seq = excluded.stored_seq",
        params![
            snapshot.author_pubkey,
            snapshot.d_tag,
            snapshot.snapshot_id,
            snapshot.op,
            snapshot.mtime,
            snapshot.entity_type,
            snapshot.event_id,
            i32::from(snapshot.payload_retained),
            snapshot.relay_url,
            snapshot.stored_seq,
            snapshot.created_at
        ],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::adapters::sqlite::migrations::account_migrations;
    use rusqlite::Connection;

    fn setup_db() -> Connection {
        let mut conn = Connection::open_in_memory().unwrap();
        account_migrations().to_latest(&mut conn).unwrap();
        conn
    }

    #[test]
    fn stores_per_relay_sync_state() {
        let conn = setup_db();

        upsert_sync_relay_state(
            &conn,
            "wss://relay-1.example",
            Some(10),
            Some(12),
            Some(15),
            Some(1_700_000_000_000),
        )
        .unwrap();

        let state = get_sync_relay_state(&conn, "wss://relay-1.example")
            .unwrap()
            .unwrap();

        assert_eq!(state.relay_url, "wss://relay-1.example");
        assert_eq!(state.checkpoint_seq, Some(10));
        assert_eq!(state.snapshot_seq, Some(12));
        assert_eq!(state.last_synced_at, Some(15));
        assert_eq!(state.min_payload_mtime, Some(1_700_000_000_000));
    }
}

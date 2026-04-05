use crate::domain::common::time::now_millis;
use crate::error::AppError;
use rusqlite::{params, Connection, OptionalExtension};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SyncRelayState {
    pub relay_url: String,
    // Last applied `CHANGES` sequence for this relay. This advances during the
    // live subscription after bootstrap.
    pub checkpoint_seq: Option<i64>,
    // Bootstrap handoff boundary returned by `NEG-STATUS.snapshot_seq`. Live
    // `CHANGES` starts from this boundary, but the value itself should remain
    // the bootstrap snapshot marker rather than being overwritten on every
    // live event.
    pub snapshot_seq: Option<i64>,
    pub last_synced_at: Option<i64>,
    pub min_payload_mtime: Option<i64>,
    pub updated_at: i64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LocalSyncRevision {
    pub author_pubkey: String,
    pub d_tag: String,
    pub rev: String,
    pub op: String,
    pub mtime: i64,
    pub entity_type: Option<String>,
    pub payload_event_id: Option<String>,
    pub payload_retained: bool,
    pub relay_url: Option<String>,
    pub stored_seq: Option<i64>,
    pub created_at: i64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LocalSyncHead {
    pub author_pubkey: String,
    pub d_tag: String,
    pub rev: String,
    pub op: String,
    pub mtime: i64,
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
    // - `snapshot_seq`: the bootstrap handoff boundary returned by Negentropy
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

pub fn upsert_sync_revision(
    conn: &Connection,
    revision: &LocalSyncRevision,
) -> Result<(), AppError> {
    conn.execute(
        "INSERT INTO sync_revisions
           (recipient, d_tag, rev, op, mtime, entity_type, payload_event_id, payload_retained, relay_url, stored_seq, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
         ON CONFLICT(recipient, d_tag, rev) DO UPDATE SET
           op = excluded.op,
           mtime = excluded.mtime,
           entity_type = excluded.entity_type,
           payload_event_id = excluded.payload_event_id,
           payload_retained = excluded.payload_retained,
           relay_url = excluded.relay_url,
           stored_seq = excluded.stored_seq",
        params![
            revision.author_pubkey,
            revision.d_tag,
            revision.rev,
            revision.op,
            revision.mtime,
            revision.entity_type,
            revision.payload_event_id,
            i32::from(revision.payload_retained),
            revision.relay_url,
            revision.stored_seq,
            revision.created_at
        ],
    )?;
    Ok(())
}

pub fn replace_sync_revision_parents(
    conn: &Connection,
    author_pubkey: &str,
    d_tag: &str,
    rev: &str,
    parent_revs: &[String],
) -> Result<(), AppError> {
    conn.execute(
        "DELETE FROM sync_revision_parents
         WHERE recipient = ?1 AND d_tag = ?2 AND rev = ?3",
        params![author_pubkey, d_tag, rev],
    )?;

    for parent_rev in parent_revs {
        conn.execute(
            "INSERT INTO sync_revision_parents (recipient, d_tag, rev, parent_rev)
             VALUES (?1, ?2, ?3, ?4)",
            params![author_pubkey, d_tag, rev, parent_rev],
        )?;
    }

    Ok(())
}

#[cfg(test)]
pub fn replace_sync_heads(
    conn: &Connection,
    author_pubkey: &str,
    d_tag: &str,
    heads: &[LocalSyncHead],
) -> Result<(), AppError> {
    // `sync_heads` stores the full current head set for one sync document
    // scope. A document may have more than one head here during a conflict.
    conn.execute(
        "DELETE FROM sync_heads WHERE recipient = ?1 AND d_tag = ?2",
        params![author_pubkey, d_tag],
    )?;

    for head in heads {
        conn.execute(
            "INSERT INTO sync_heads (recipient, d_tag, rev, op, mtime)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                head.author_pubkey,
                head.d_tag,
                head.rev,
                head.op,
                head.mtime
            ],
        )?;
    }

    Ok(())
}

pub fn apply_sync_head_update(
    conn: &Connection,
    author_pubkey: &str,
    d_tag: &str,
    rev: &str,
    op: &str,
    mtime: i64,
    parent_revs: &[String],
) -> Result<(), AppError> {
    for parent_rev in parent_revs {
        conn.execute(
            "DELETE FROM sync_heads
             WHERE recipient = ?1 AND d_tag = ?2 AND rev = ?3",
            params![author_pubkey, d_tag, parent_rev],
        )?;
    }

    conn.execute(
        "INSERT OR REPLACE INTO sync_heads (recipient, d_tag, rev, op, mtime)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![author_pubkey, d_tag, rev, op, mtime],
    )?;

    Ok(())
}

pub fn list_sync_heads_for_author(
    conn: &Connection,
    author_pubkey: &str,
) -> Result<Vec<LocalSyncHead>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT recipient, d_tag, rev, op, mtime
         FROM sync_heads
         WHERE recipient = ?1
         ORDER BY d_tag ASC, mtime ASC",
    )?;
    let rows = stmt.query_map(params![author_pubkey], |row| {
        Ok(LocalSyncHead {
            author_pubkey: row.get(0)?,
            d_tag: row.get(1)?,
            rev: row.get(2)?,
            op: row.get(3)?,
            mtime: row.get(4)?,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

pub fn list_sync_heads_for_scope(
    conn: &Connection,
    author_pubkey: &str,
    d_tag: &str,
) -> Result<Vec<LocalSyncHead>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT recipient, d_tag, rev, op, mtime
         FROM sync_heads
         WHERE recipient = ?1 AND d_tag = ?2
         ORDER BY mtime DESC, rev ASC",
    )?;
    let rows = stmt.query_map(params![author_pubkey, d_tag], |row| {
        Ok(LocalSyncHead {
            author_pubkey: row.get(0)?,
            d_tag: row.get(1)?,
            rev: row.get(2)?,
            op: row.get(3)?,
            mtime: row.get(4)?,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

pub fn list_sync_revision_parents(
    conn: &Connection,
    author_pubkey: &str,
    d_tag: &str,
    rev: &str,
) -> Result<Vec<String>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT parent_rev
         FROM sync_revision_parents
         WHERE recipient = ?1 AND d_tag = ?2 AND rev = ?3
         ORDER BY parent_rev ASC",
    )?;
    let rows = stmt.query_map(params![author_pubkey, d_tag, rev], |row| row.get(0))?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
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

    #[test]
    fn replaces_sync_heads_per_document_scope() {
        let conn = setup_db();

        replace_sync_heads(
            &conn,
            "recipient-1",
            "doc-1",
            &[LocalSyncHead {
                author_pubkey: "recipient-1".into(),
                d_tag: "doc-1".into(),
                rev: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa".into(),
                op: "put".into(),
                mtime: 1000,
            }],
        )
        .unwrap();

        replace_sync_heads(
            &conn,
            "recipient-1",
            "doc-1",
            &[LocalSyncHead {
                author_pubkey: "recipient-1".into(),
                d_tag: "doc-1".into(),
                rev: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb".into(),
                op: "put".into(),
                mtime: 2000,
            }],
        )
        .unwrap();

        let heads = list_sync_heads_for_author(&conn, "recipient-1").unwrap();
        assert_eq!(heads.len(), 1);
        assert_eq!(
            heads[0].rev,
            "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
        );
    }

    #[test]
    fn apply_sync_head_update_preserves_conflicting_heads() {
        let conn = setup_db();

        apply_sync_head_update(
            &conn,
            "recipient-1",
            "doc-1",
            "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            "put",
            1000,
            &[],
        )
        .unwrap();

        apply_sync_head_update(
            &conn,
            "recipient-1",
            "doc-1",
            "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            "put",
            2000,
            &["aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa".into()],
        )
        .unwrap();

        apply_sync_head_update(
            &conn,
            "recipient-1",
            "doc-1",
            "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
            "put",
            2000,
            &["aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa".into()],
        )
        .unwrap();

        let heads = list_sync_heads_for_scope(&conn, "recipient-1", "doc-1").unwrap();
        assert_eq!(heads.len(), 2);
        assert_eq!(
            heads
                .iter()
                .map(|head| head.rev.as_str())
                .collect::<Vec<_>>(),
            vec![
                "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
                "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
            ]
        );
    }
}

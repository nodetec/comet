use crate::domain::common::time::now_millis;
use crate::domain::notes::model::WikiLinkResolutionInput;
use crate::error::AppError;
use nostr_sdk::prelude::{Event, JsonUtil};
use rusqlite::{params, Connection, OptionalExtension};
use std::collections::HashSet;

const LOCAL_RECENT_SNAPSHOT_WINDOW: usize = 10;
const MAX_TOMBSTONES: usize = 100;

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

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LocalNoteSnapshotHistoryEntry {
    pub snapshot_event_id: String,
    pub note_id: String,
    pub op: String,
    pub device_id: String,
    pub vector_clock: String,
    pub title: Option<String>,
    pub markdown: Option<String>,
    pub modified_at: i64,
    pub edited_at: Option<i64>,
    pub deleted_at: Option<i64>,
    pub archived_at: Option<i64>,
    pub pinned_at: Option<i64>,
    pub readonly: bool,
    pub created_at: i64,
    pub wikilink_resolutions: Vec<WikiLinkResolutionInput>,
}

pub fn clear_local_snapshot_state(conn: &Connection) -> Result<(), AppError> {
    crate::adapters::sqlite::tag_index::clear_tag_index(conn)?;
    conn.execute_batch(
        "DELETE FROM note_wikilinks;
         DELETE FROM notes_fts;
         DELETE FROM bootstrap_snapshot_stage;
         DELETE FROM note_conflicts;
         DELETE FROM note_tombstones;
         DELETE FROM notes;
         DELETE FROM blob_meta;
         DELETE FROM blob_uploads;
         DELETE FROM pending_blob_uploads;
         DELETE FROM pending_deletions;
         DELETE FROM note_snapshot_history;
         DELETE FROM sync_snapshots;
         DELETE FROM sync_relay_state;
         DELETE FROM sync_relays;
         DELETE FROM app_settings WHERE key IN ('active_sync_relay_url');",
    )?;
    Ok(())
}

pub fn clear_bootstrap_snapshot_stage(conn: &Connection, relay_url: &str) -> Result<(), AppError> {
    conn.execute(
        "DELETE FROM bootstrap_snapshot_stage WHERE relay_url = ?1",
        params![relay_url],
    )?;
    Ok(())
}

pub fn stage_bootstrap_snapshot_event(
    conn: &Connection,
    relay_url: &str,
    event: &Event,
) -> Result<(), AppError> {
    conn.execute(
        "INSERT INTO bootstrap_snapshot_stage
           (relay_url, snapshot_event_id, created_at, raw_event_json)
         VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(relay_url, snapshot_event_id) DO UPDATE SET
           created_at = excluded.created_at,
           raw_event_json = excluded.raw_event_json",
        params![
            relay_url,
            event.id.to_hex(),
            event.created_at.as_secs() as i64,
            event.as_json()
        ],
    )?;
    Ok(())
}

pub fn for_each_staged_bootstrap_snapshot_event(
    conn: &Connection,
    relay_url: &str,
    mut callback: impl FnMut(&str, Event) -> Result<(), AppError>,
) -> Result<(), AppError> {
    let mut stmt = conn.prepare(
        "SELECT snapshot_event_id, raw_event_json
         FROM bootstrap_snapshot_stage
         WHERE relay_url = ?1
         ORDER BY created_at ASC, snapshot_event_id ASC",
    )?;
    let rows = stmt.query_map(params![relay_url], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })?;

    for row in rows {
        let (snapshot_event_id, raw_event_json) = row?;
        let event = Event::from_json(raw_event_json).map_err(|error| {
            AppError::custom(format!(
                "Failed to parse staged bootstrap snapshot event {snapshot_event_id}: {error}"
            ))
        })?;
        callback(&snapshot_event_id, event)?;
    }

    Ok(())
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
    prune_sync_snapshots_for_document(
        conn,
        &snapshot.author_pubkey,
        &snapshot.d_tag,
        LOCAL_RECENT_SNAPSHOT_WINDOW,
    )?;
    Ok(())
}

pub fn upsert_note_snapshot_history(
    conn: &Connection,
    snapshot: &LocalNoteSnapshotHistoryEntry,
) -> Result<(), AppError> {
    conn.execute(
        "INSERT INTO note_snapshot_history
           (snapshot_event_id, note_id, op, device_id, vector_clock, title, markdown, modified_at, edited_at, deleted_at, archived_at, pinned_at, readonly, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
         ON CONFLICT(snapshot_event_id) DO UPDATE SET
           note_id = excluded.note_id,
           op = excluded.op,
           device_id = excluded.device_id,
           vector_clock = excluded.vector_clock,
           title = excluded.title,
           markdown = excluded.markdown,
           modified_at = excluded.modified_at,
           edited_at = excluded.edited_at,
           deleted_at = excluded.deleted_at,
           archived_at = excluded.archived_at,
           pinned_at = excluded.pinned_at,
           readonly = excluded.readonly,
           created_at = excluded.created_at",
        params![
            snapshot.snapshot_event_id,
            snapshot.note_id,
            snapshot.op,
            snapshot.device_id,
            snapshot.vector_clock,
            snapshot.title,
            snapshot.markdown,
            snapshot.modified_at,
            snapshot.edited_at,
            snapshot.deleted_at,
            snapshot.archived_at,
            snapshot.pinned_at,
            i32::from(snapshot.readonly),
            snapshot.created_at
        ],
    )?;
    conn.execute(
        "DELETE FROM note_snapshot_history_wikilinks
         WHERE snapshot_event_id = ?1",
        params![snapshot.snapshot_event_id],
    )?;
    for wikilink in &snapshot.wikilink_resolutions {
        conn.execute(
            "INSERT INTO note_snapshot_history_wikilinks
               (snapshot_event_id, occurrence_id, location, title, target_note_id)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                snapshot.snapshot_event_id,
                wikilink.occurrence_id,
                wikilink.location as i64,
                wikilink.title,
                wikilink.target_note_id,
            ],
        )?;
    }
    Ok(())
}

fn protected_snapshot_ids_for_document(
    conn: &Connection,
    d_tag: &str,
) -> Result<HashSet<String>, AppError> {
    let mut protected = HashSet::new();

    let note_snapshot_event_id = conn
        .query_row(
            "SELECT snapshot_event_id FROM notes WHERE id = ?1",
            params![d_tag],
            |row| row.get::<_, Option<String>>(0),
        )
        .optional()?
        .flatten();
    if let Some(snapshot_id) = note_snapshot_event_id.filter(|value| !value.trim().is_empty()) {
        protected.insert(snapshot_id);
    }

    let tombstone_snapshot_event_id = conn
        .query_row(
            "SELECT snapshot_event_id FROM note_tombstones WHERE id = ?1",
            params![d_tag],
            |row| row.get::<_, Option<String>>(0),
        )
        .optional()?
        .flatten();
    if let Some(snapshot_id) = tombstone_snapshot_event_id.filter(|value| !value.trim().is_empty())
    {
        protected.insert(snapshot_id);
    }

    let mut stmt = conn.prepare(
        "SELECT snapshot_event_id
         FROM note_conflicts
         WHERE note_id = ?1",
    )?;
    let rows = stmt.query_map(params![d_tag], |row| row.get::<_, String>(0))?;
    for row in rows {
        let snapshot_id = row?;
        if !snapshot_id.trim().is_empty() {
            protected.insert(snapshot_id);
        }
    }

    Ok(protected)
}

fn prune_sync_snapshots_for_document(
    conn: &Connection,
    author_pubkey: &str,
    d_tag: &str,
    recent_window: usize,
) -> Result<usize, AppError> {
    let protected_ids = protected_snapshot_ids_for_document(conn, d_tag)?;
    let mut stmt = conn.prepare(
        "SELECT snapshot_id
         FROM sync_snapshots
         WHERE author_pubkey = ?1 AND d_tag = ?2
         ORDER BY created_at DESC, mtime DESC, snapshot_id DESC",
    )?;
    let rows = stmt.query_map(params![author_pubkey, d_tag], |row| row.get::<_, String>(0))?;

    let mut keep_ids = protected_ids;
    let mut kept_recent = 0usize;
    let mut delete_ids = Vec::new();

    for row in rows {
        let snapshot_id = row?;
        if keep_ids.contains(&snapshot_id) {
            continue;
        }
        if kept_recent < recent_window {
            keep_ids.insert(snapshot_id);
            kept_recent += 1;
        } else {
            delete_ids.push(snapshot_id);
        }
    }

    for snapshot_id in &delete_ids {
        conn.execute(
            "DELETE FROM sync_snapshots
             WHERE author_pubkey = ?1 AND d_tag = ?2 AND snapshot_id = ?3",
            params![author_pubkey, d_tag, snapshot_id],
        )?;
        conn.execute(
            "DELETE FROM note_snapshot_history
             WHERE snapshot_event_id = ?1",
            params![snapshot_id],
        )?;
    }

    Ok(delete_ids.len())
}

/// Prune sync artifacts for the oldest tombstoned documents beyond the cap.
///
/// The tombstone rows themselves are preserved — their vector clocks are
/// needed to reject stale puts from other relays or delayed bootstraps.
/// Only the associated `sync_snapshots` and `note_snapshot_history` rows
/// are deleted, since those are the heavyweight data.
pub fn prune_oldest_tombstones(conn: &Connection) -> Result<usize, AppError> {
    let total: i64 = conn.query_row(
        "SELECT COUNT(*) FROM note_tombstones",
        [],
        |row| row.get(0),
    )?;

    if total <= MAX_TOMBSTONES as i64 {
        return Ok(0);
    }

    let excess = total - MAX_TOMBSTONES as i64;
    let mut stmt = conn.prepare(
        "SELECT id FROM note_tombstones
         WHERE locally_modified = 0
         ORDER BY deleted_at ASC
         LIMIT ?1",
    )?;
    let prunable_ids: Vec<String> = stmt
        .query_map(params![excess], |row| row.get(0))?
        .collect::<Result<_, _>>()?;

    for note_id in &prunable_ids {
        conn.execute(
            "UPDATE note_tombstones
             SET snapshot_event_id = NULL
             WHERE id = ?1",
            params![note_id],
        )?;
        conn.execute(
            "DELETE FROM sync_snapshots WHERE d_tag = ?1",
            params![note_id],
        )?;
        conn.execute(
            "DELETE FROM note_snapshot_history WHERE note_id = ?1",
            params![note_id],
        )?;
    }

    Ok(prunable_ids.len())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::adapters::sqlite::migrations::account_migrations;
    use nostr_sdk::prelude::{EventBuilder, Keys, Tag};
    use rusqlite::{Connection, OptionalExtension};

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
    fn stages_and_clears_bootstrap_snapshot_events() {
        let conn = setup_db();
        let keys = Keys::generate();
        let event = EventBuilder::text_note("hello")
            .tags([
                Tag::custom(
                    nostr_sdk::prelude::TagKind::custom("d"),
                    vec!["note-1".to_string()],
                ),
                Tag::custom(
                    nostr_sdk::prelude::TagKind::custom("o"),
                    vec!["put".to_string()],
                ),
                Tag::custom(
                    nostr_sdk::prelude::TagKind::custom("vc"),
                    vec!["DEVICE-A".to_string(), "1".to_string()],
                ),
            ])
            .sign_with_keys(&keys)
            .unwrap();

        stage_bootstrap_snapshot_event(&conn, "wss://relay.example", &event).unwrap();

        let mut seen = Vec::new();
        for_each_staged_bootstrap_snapshot_event(
            &conn,
            "wss://relay.example",
            |snapshot_id, row| {
                seen.push((snapshot_id.to_string(), row.id.to_hex()));
                Ok(())
            },
        )
        .unwrap();

        assert_eq!(seen, vec![(event.id.to_hex(), event.id.to_hex())]);

        clear_bootstrap_snapshot_stage(&conn, "wss://relay.example").unwrap();

        let staged_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM bootstrap_snapshot_stage WHERE relay_url = ?1",
                params!["wss://relay.example"],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(staged_count, 0);
    }

    #[test]
    fn prunes_old_unprotected_snapshots_per_document() {
        let conn = setup_db();
        conn.execute(
            "INSERT INTO notes (id, title, markdown, created_at, modified_at, edited_at, snapshot_event_id)
             VALUES ('note-1', 'Title', '# Title', 1, 1, 1, 'snapshot-current')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO note_conflicts (snapshot_event_id, note_id, op, device_id, vector_clock, title, markdown, modified_at, edited_at, deleted_at, archived_at, pinned_at, readonly, created_at)
             VALUES ('snapshot-conflict', 'note-1', 'put', 'DEVICE-A', '{}', 'Conflict', '# Conflict', 20, 20, NULL, NULL, NULL, 0, 20)",
            [],
        )
        .unwrap();

        for index in 0..15 {
            upsert_sync_snapshot(
                &conn,
                &LocalSyncSnapshot {
                    author_pubkey: "author-1".to_string(),
                    d_tag: "note-1".to_string(),
                    snapshot_id: format!("snapshot-{index:02}"),
                    op: "put".to_string(),
                    mtime: index as i64,
                    entity_type: Some("note".to_string()),
                    event_id: Some(format!("snapshot-{index:02}")),
                    payload_retained: true,
                    relay_url: None,
                    stored_seq: None,
                    created_at: index as i64,
                },
            )
            .unwrap();
        }

        upsert_sync_snapshot(
            &conn,
            &LocalSyncSnapshot {
                author_pubkey: "author-1".to_string(),
                d_tag: "note-1".to_string(),
                snapshot_id: "snapshot-current".to_string(),
                op: "put".to_string(),
                mtime: 100,
                entity_type: Some("note".to_string()),
                event_id: Some("snapshot-current".to_string()),
                payload_retained: true,
                relay_url: None,
                stored_seq: None,
                created_at: 100,
            },
        )
        .unwrap();
        upsert_sync_snapshot(
            &conn,
            &LocalSyncSnapshot {
                author_pubkey: "author-1".to_string(),
                d_tag: "note-1".to_string(),
                snapshot_id: "snapshot-conflict".to_string(),
                op: "put".to_string(),
                mtime: 101,
                entity_type: Some("note".to_string()),
                event_id: Some("snapshot-conflict".to_string()),
                payload_retained: true,
                relay_url: None,
                stored_seq: None,
                created_at: 101,
            },
        )
        .unwrap();

        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sync_snapshots WHERE author_pubkey = 'author-1' AND d_tag = 'note-1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 12);

        let has_current: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sync_snapshots WHERE snapshot_id = 'snapshot-current'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let has_conflict: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sync_snapshots WHERE snapshot_id = 'snapshot-conflict'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let pruned_oldest: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sync_snapshots WHERE snapshot_id = 'snapshot-00'",
                [],
                |row| row.get(0),
            )
            .unwrap();

        assert_eq!(has_current, 1);
        assert_eq!(has_conflict, 1);
        assert_eq!(pruned_oldest, 0);
    }

    #[test]
    fn prunes_history_rows_with_old_unprotected_snapshots() {
        let conn = setup_db();
        conn.execute(
            "INSERT INTO notes (id, title, markdown, created_at, modified_at, edited_at, snapshot_event_id)
             VALUES ('note-1', 'Title', '# Title', 1, 1, 1, 'snapshot-current')",
            [],
        )
        .unwrap();

        for index in 0..12 {
            let snapshot_id = format!("snapshot-{index:02}");
            upsert_sync_snapshot(
                &conn,
                &LocalSyncSnapshot {
                    author_pubkey: "author-1".to_string(),
                    d_tag: "note-1".to_string(),
                    snapshot_id: snapshot_id.clone(),
                    op: "put".to_string(),
                    mtime: index as i64,
                    entity_type: Some("note".to_string()),
                    event_id: Some(snapshot_id.clone()),
                    payload_retained: true,
                    relay_url: None,
                    stored_seq: None,
                    created_at: index as i64,
                },
            )
            .unwrap();
            upsert_note_snapshot_history(
                &conn,
                &LocalNoteSnapshotHistoryEntry {
                    snapshot_event_id: snapshot_id.clone(),
                    note_id: "note-1".to_string(),
                    op: "put".to_string(),
                    device_id: "DEVICE-A".to_string(),
                    vector_clock: "{}".to_string(),
                    title: Some(format!("Title {index}")),
                    markdown: Some(format!("# Title {index}")),
                    modified_at: index as i64,
                    edited_at: Some(index as i64),
                    deleted_at: None,
                    archived_at: None,
                    pinned_at: None,
                    readonly: false,
                    created_at: index as i64,
                    wikilink_resolutions: vec![],
                },
            )
            .unwrap();
        }

        upsert_sync_snapshot(
            &conn,
            &LocalSyncSnapshot {
                author_pubkey: "author-1".to_string(),
                d_tag: "note-1".to_string(),
                snapshot_id: "snapshot-current".to_string(),
                op: "put".to_string(),
                mtime: 100,
                entity_type: Some("note".to_string()),
                event_id: Some("snapshot-current".to_string()),
                payload_retained: true,
                relay_url: None,
                stored_seq: None,
                created_at: 100,
            },
        )
        .unwrap();
        upsert_note_snapshot_history(
            &conn,
            &LocalNoteSnapshotHistoryEntry {
                snapshot_event_id: "snapshot-current".to_string(),
                note_id: "note-1".to_string(),
                op: "put".to_string(),
                device_id: "DEVICE-A".to_string(),
                vector_clock: "{}".to_string(),
                title: Some("Current".to_string()),
                markdown: Some("# Current".to_string()),
                modified_at: 100,
                edited_at: Some(100),
                deleted_at: None,
                archived_at: None,
                pinned_at: None,
                readonly: false,
                created_at: 100,
                wikilink_resolutions: vec![],
            },
        )
        .unwrap();

        let history_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM note_snapshot_history", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(history_count, 11);

        let oldest_history_exists: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM note_snapshot_history WHERE snapshot_event_id = 'snapshot-00'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(oldest_history_exists, 0);

        let current_history_exists: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM note_snapshot_history WHERE snapshot_event_id = 'snapshot-current'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(current_history_exists, 1);
    }

    #[test]
    fn clear_local_snapshot_state_wipes_sync_state_and_blob_bookkeeping() {
        let conn = setup_db();

        conn.execute_batch(
            "INSERT INTO relays (url, kind, created_at)
                 VALUES ('wss://relay.example', 'sync', 1);
             INSERT INTO sync_relays (relay_url, created_at)
                 VALUES ('wss://relay.example', 1);
             INSERT INTO sync_relay_state (relay_url, checkpoint_seq, snapshot_seq, last_synced_at, min_payload_mtime, updated_at)
                 VALUES ('wss://relay.example', 10, 20, 30, 40, 50);
             INSERT INTO notes (id, title, markdown, created_at, modified_at, edited_at, snapshot_event_id, locally_modified)
                 VALUES ('note-1', 'Title', '# Title', 1, 2, 2, 'event-1', 1);
             INSERT INTO notes_fts (note_id, title, markdown)
                 VALUES ('note-1', 'Title', '# Title');
             INSERT INTO blob_meta (plaintext_hash, server_url, pubkey, ciphertext_hash, encryption_key)
                 VALUES ('plain-1', 'https://blobs.example.com', 'pubkey-1', 'cipher-1', 'key-1');
             INSERT INTO blob_uploads (object_hash, server_url, encrypted, size_bytes, uploaded_at)
                 VALUES ('cipher-1', 'https://blobs.example.com', 1, 123, 1);
             INSERT INTO pending_blob_uploads (plaintext_hash, server_url, pubkey, ciphertext_hash, encryption_key, ciphertext, content_type, size_bytes, created_at, updated_at)
                 VALUES ('plain-1', 'https://blobs.example.com', 'pubkey-1', 'cipher-1', 'key-1', X'01', 'image/png', 123, 1, 1);
             INSERT INTO pending_deletions (entity_id, created_at)
                 VALUES ('note-1', 1);
             INSERT INTO sync_snapshots (author_pubkey, d_tag, snapshot_id, op, mtime, entity_type, event_id, relay_url, stored_seq, created_at)
                 VALUES ('author-1', 'doc-1', 'snapshot-1', 'put', 2, 'note', 'event-1', 'wss://relay.example', 10, 1);
             INSERT INTO tags (id, path, parent_id, last_segment, depth, pinned, hide_subtag_notes, icon, created_at, updated_at)
                 VALUES (1, 'alpha', NULL, 'alpha', 0, 0, 0, NULL, 1, 1);
             INSERT INTO note_tag_links (note_id, tag_id, is_direct)
                 VALUES ('note-1', 1, 1);
             INSERT INTO app_settings (key, value)
                 VALUES ('active_sync_relay_url', 'wss://relay.example');",
        )
        .unwrap();

        clear_local_snapshot_state(&conn).unwrap();

        let notes: i64 = conn
            .query_row("SELECT COUNT(*) FROM notes", [], |row| row.get(0))
            .unwrap();
        let notes_fts: i64 = conn
            .query_row("SELECT COUNT(*) FROM notes_fts", [], |row| row.get(0))
            .unwrap();
        let blob_meta: i64 = conn
            .query_row("SELECT COUNT(*) FROM blob_meta", [], |row| row.get(0))
            .unwrap();
        let blob_uploads: i64 = conn
            .query_row("SELECT COUNT(*) FROM blob_uploads", [], |row| row.get(0))
            .unwrap();
        let pending_blob_uploads: i64 = conn
            .query_row("SELECT COUNT(*) FROM pending_blob_uploads", [], |row| {
                row.get(0)
            })
            .unwrap();
        let pending_deletions: i64 = conn
            .query_row("SELECT COUNT(*) FROM pending_deletions", [], |row| {
                row.get(0)
            })
            .unwrap();
        let sync_snapshots: i64 = conn
            .query_row("SELECT COUNT(*) FROM sync_snapshots", [], |row| row.get(0))
            .unwrap();
        let sync_relay_state: i64 = conn
            .query_row("SELECT COUNT(*) FROM sync_relay_state", [], |row| {
                row.get(0)
            })
            .unwrap();
        let sync_relays: i64 = conn
            .query_row("SELECT COUNT(*) FROM sync_relays", [], |row| row.get(0))
            .unwrap();
        let relays: i64 = conn
            .query_row("SELECT COUNT(*) FROM relays", [], |row| row.get(0))
            .unwrap();
        let tags: i64 = conn
            .query_row("SELECT COUNT(*) FROM tags", [], |row| row.get(0))
            .unwrap();
        let note_tag_links: i64 = conn
            .query_row("SELECT COUNT(*) FROM note_tag_links", [], |row| row.get(0))
            .unwrap();
        let active_sync_relay_url: Option<String> = conn
            .query_row(
                "SELECT value FROM app_settings WHERE key = 'active_sync_relay_url'",
                [],
                |row| row.get(0),
            )
            .optional()
            .unwrap();

        assert_eq!(notes, 0);
        assert_eq!(notes_fts, 0);
        assert_eq!(blob_meta, 0);
        assert_eq!(blob_uploads, 0);
        assert_eq!(pending_blob_uploads, 0);
        assert_eq!(pending_deletions, 0);
        assert_eq!(sync_snapshots, 0);
        assert_eq!(sync_relay_state, 0);
        assert_eq!(sync_relays, 0);
        assert_eq!(tags, 0);
        assert_eq!(note_tag_links, 0);
        assert_eq!(active_sync_relay_url, None);
        assert_eq!(relays, 1);
    }

    fn insert_tombstone(conn: &Connection, note_id: &str, deleted_at: i64, locally_modified: bool) {
        conn.execute(
            "INSERT INTO note_tombstones (id, deleted_at, last_edit_device_id, vector_clock, locally_modified)
             VALUES (?1, ?2, 'DEVICE-A', '{}', ?3)",
            params![note_id, deleted_at, i32::from(locally_modified)],
        )
        .unwrap();
    }

    fn tombstone_count(conn: &Connection) -> i64 {
        conn.query_row("SELECT COUNT(*) FROM note_tombstones", [], |row| row.get(0)).unwrap()
    }

    fn tombstone_exists(conn: &Connection, note_id: &str) -> bool {
        conn.query_row(
            "SELECT COUNT(*) FROM note_tombstones WHERE id = ?1",
            params![note_id],
            |row| row.get::<_, i64>(0),
        )
        .unwrap()
            > 0
    }

    fn tombstone_snapshot_event_id(conn: &Connection, note_id: &str) -> Option<String> {
        conn.query_row(
            "SELECT snapshot_event_id FROM note_tombstones WHERE id = ?1",
            params![note_id],
            |row| row.get(0),
        )
        .optional()
        .unwrap()
        .flatten()
    }

    #[test]
    fn prunes_oldest_tombstone_sync_artifacts_when_over_cap() {
        let conn = setup_db();

        for i in 0..105 {
            let note_id = format!("note-{i:03}");
            insert_tombstone(&conn, &note_id, i, false);
            conn.execute(
                "UPDATE note_tombstones SET snapshot_event_id = ?1 WHERE id = ?2",
                params![format!("event-{i:03}"), note_id],
            )
            .unwrap();
        }
        assert_eq!(tombstone_count(&conn), 105);

        let pruned = prune_oldest_tombstones(&conn).unwrap();
        assert_eq!(pruned, 5);

        // All 105 tombstone rows are preserved (vector clocks still guard
        // against stale restores)
        assert_eq!(tombstone_count(&conn), 105);

        // Pruned tombstones had their snapshot_event_id cleared
        for i in 0..5 {
            assert!(tombstone_exists(&conn, &format!("note-{i:03}")));
            assert_eq!(tombstone_snapshot_event_id(&conn, &format!("note-{i:03}")), None);
        }
        // Newest 100 still reference their snapshot events
        for i in 5..105 {
            assert_eq!(
                tombstone_snapshot_event_id(&conn, &format!("note-{i:03}")),
                Some(format!("event-{i:03}")),
            );
        }
    }

    #[test]
    fn skips_locally_modified_tombstones_during_pruning() {
        let conn = setup_db();

        // 10 oldest are locally_modified
        for i in 0..10 {
            insert_tombstone(&conn, &format!("note-{i:03}"), i, true);
        }
        // 95 synced
        for i in 10..105 {
            insert_tombstone(&conn, &format!("note-{i:03}"), i, false);
        }
        assert_eq!(tombstone_count(&conn), 105);

        let pruned = prune_oldest_tombstones(&conn).unwrap();
        // Only synced ones can be pruned: need to remove 5, oldest synced start at i=10
        assert_eq!(pruned, 5);

        // All tombstone rows preserved
        assert_eq!(tombstone_count(&conn), 105);
        for i in 0..105 {
            assert!(tombstone_exists(&conn, &format!("note-{i:03}")));
        }
    }

    #[test]
    fn cleans_up_sync_snapshots_and_history_for_pruned_tombstones() {
        let conn = setup_db();

        for i in 0..105 {
            let note_id = format!("note-{i:03}");
            insert_tombstone(&conn, &note_id, i, false);

            upsert_sync_snapshot(
                &conn,
                &LocalSyncSnapshot {
                    author_pubkey: "author-1".to_string(),
                    d_tag: note_id.clone(),
                    snapshot_id: format!("snapshot-{i:03}"),
                    op: "del".to_string(),
                    mtime: i,
                    entity_type: Some("note".to_string()),
                    event_id: Some(format!("snapshot-{i:03}")),
                    payload_retained: true,
                    relay_url: None,
                    stored_seq: None,
                    created_at: i,
                },
            )
            .unwrap();

            upsert_note_snapshot_history(
                &conn,
                &LocalNoteSnapshotHistoryEntry {
                    snapshot_event_id: format!("snapshot-{i:03}"),
                    note_id: note_id.clone(),
                    op: "del".to_string(),
                    device_id: "DEVICE-A".to_string(),
                    vector_clock: "{}".to_string(),
                    title: None,
                    markdown: None,
                    modified_at: i,
                    edited_at: None,
                    deleted_at: Some(i),
                    archived_at: None,
                    pinned_at: None,
                    readonly: false,
                    created_at: i,
                    wikilink_resolutions: vec![],
                },
            )
            .unwrap();
        }

        prune_oldest_tombstones(&conn).unwrap();

        // Tombstone row preserved, but snapshot_event_id cleared
        assert!(tombstone_exists(&conn, "note-000"));
        assert_eq!(tombstone_snapshot_event_id(&conn, "note-000"), None);

        // Pruned tombstone's sync snapshots and history should be gone
        let snapshot_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sync_snapshots WHERE d_tag = 'note-000'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let history_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM note_snapshot_history WHERE note_id = 'note-000'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(snapshot_count, 0);
        assert_eq!(history_count, 0);

        // Surviving tombstone's data should remain
        let snapshot_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sync_snapshots WHERE d_tag = 'note-104'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let history_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM note_snapshot_history WHERE note_id = 'note-104'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(snapshot_count, 1);
        assert_eq!(history_count, 1);
    }

    #[test]
    fn does_not_prune_tombstones_when_under_cap() {
        let conn = setup_db();

        for i in 0..50 {
            insert_tombstone(&conn, &format!("note-{i:03}"), i, false);
        }

        let pruned = prune_oldest_tombstones(&conn).unwrap();
        assert_eq!(pruned, 0);
        assert_eq!(tombstone_count(&conn), 50);
    }
}

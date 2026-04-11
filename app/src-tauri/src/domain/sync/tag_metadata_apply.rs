use crate::adapters::nostr::comet_tag_metadata_snapshot::{
    parse_tag_metadata_snapshot_event, TagMetadataSnapshotPayload, COMET_TAG_METADATA_COLLECTION,
    COMET_TAG_METADATA_D_TAG,
};
use crate::adapters::sqlite::snapshot_repository::{
    get_sync_relay_state, upsert_sync_relay_state, upsert_sync_snapshot, LocalSyncSnapshot,
};
use crate::domain::sync::vector_clock::{
    compare_vector_clocks, merge_vector_clocks, parse_vector_clock, serialize_vector_clock,
    VectorClockComparison,
};
use crate::error::AppError;
use nostr_sdk::prelude::*;
use rusqlite::{params, Connection, OptionalExtension};

/// Apply a remote tag metadata snapshot event.
///
/// Returns `true` if changes were applied to local tag metadata.
pub fn apply_remote_tag_metadata_snapshot(
    conn: &Connection,
    relay_url: &str,
    keys: &Keys,
    event: &Event,
    stored_seq: Option<i64>,
) -> Result<bool, AppError> {
    let parsed = parse_tag_metadata_snapshot_event(keys, event)?;
    let author_pubkey = event.pubkey.to_hex();
    let snapshot_timestamp_ms = event.created_at.as_secs() as i64 * 1000;

    let local_clock_json: Option<String> = conn
        .query_row(
            "SELECT value FROM app_settings WHERE key = 'tag_metadata_vector_clock'",
            [],
            |row| row.get(0),
        )
        .optional()?
        .flatten();

    let local_clock = local_clock_json
        .as_deref()
        .and_then(|json| parse_vector_clock(json).ok())
        .unwrap_or_default();

    let incoming_clock = &parsed.payload.vector_clock;
    let should_apply = if local_clock.is_empty() {
        true
    } else {
        let comparison =
            compare_vector_clocks(&incoming_clock, &local_clock).map_err(AppError::custom)?;
        match comparison {
            VectorClockComparison::Dominates => true,
            VectorClockComparison::Dominated | VectorClockComparison::Equal => false,
            VectorClockComparison::Concurrent => {
                let incoming_sum: u64 = incoming_clock.values().sum();
                let local_sum: u64 = local_clock.values().sum();
                if incoming_sum != local_sum {
                    incoming_sum > local_sum
                } else {
                    // Deterministic tiebreaker: lexicographically higher event
                    // ID wins so both sides converge on the same snapshot.
                    event.id.to_hex() > stored_event_id_for_tag_metadata(conn)
                }
            }
        }
    };

    let applied = if should_apply {
        apply_tag_metadata_to_db(conn, &parsed.payload)?;

        let merged = merge_vector_clocks(incoming_clock, &local_clock).map_err(AppError::custom)?;
        let merged_json = serialize_vector_clock(&merged).map_err(AppError::custom)?;
        conn.execute(
            "INSERT INTO app_settings (key, value) VALUES ('tag_metadata_vector_clock', ?1)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![merged_json],
        )?;
        conn.execute(
            "INSERT INTO app_settings (key, value) VALUES ('tag_metadata_locally_modified', 'false')
             ON CONFLICT(key) DO UPDATE SET value = 'false'",
            [],
        )?;
        true
    } else {
        false
    };

    upsert_sync_snapshot(
        conn,
        &LocalSyncSnapshot {
            author_pubkey: author_pubkey.clone(),
            d_tag: COMET_TAG_METADATA_D_TAG.to_string(),
            snapshot_id: event.id.to_hex(),
            op: parsed.operation.clone(),
            mtime: snapshot_timestamp_ms,
            entity_type: Some(COMET_TAG_METADATA_COLLECTION.to_string()),
            event_id: Some(event.id.to_hex()),
            payload_retained: true,
            relay_url: Some(relay_url.to_string()),
            stored_seq,
            created_at: event.created_at.as_secs() as i64,
        },
    )?;

    if let Some(stored_seq) = stored_seq {
        let state = get_sync_relay_state(conn, relay_url)?;
        let min_payload_mtime = state.as_ref().and_then(|state| state.min_payload_mtime);
        let snapshot_seq = state.as_ref().and_then(|state| state.snapshot_seq);
        upsert_sync_relay_state(
            conn,
            relay_url,
            Some(stored_seq),
            snapshot_seq,
            Some(crate::domain::common::time::now_millis()),
            min_payload_mtime,
        )?;
    }

    Ok(applied)
}

fn apply_tag_metadata_to_db(
    conn: &Connection,
    payload: &TagMetadataSnapshotPayload,
) -> Result<(), AppError> {
    // Persist the canonical payload so it can be re-applied after tags are
    // created by later note syncs (bootstrap ordering is not guaranteed).
    let json = payload.to_canonical_json()?;
    conn.execute(
        "INSERT INTO app_settings (key, value) VALUES ('tag_metadata_stored_payload', ?1)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![json],
    )?;

    apply_tag_metadata_entries(conn, payload)
}

fn apply_tag_metadata_entries(
    conn: &Connection,
    payload: &TagMetadataSnapshotPayload,
) -> Result<(), AppError> {
    // Reset all tags to defaults first
    conn.execute("UPDATE tags SET pinned = 0, icon = NULL", [])?;

    // Apply metadata from payload for tags that exist locally
    for (path, entry) in &payload.tags {
        conn.execute(
            "UPDATE tags SET pinned = ?1, icon = ?2 WHERE path = ?3",
            params![entry.pinned as i32, entry.icon, path],
        )?;
    }

    Ok(())
}

/// Re-apply the most recently synced tag metadata payload.
///
/// Call this after operations that may create tag rows (bootstrap, tag index
/// rebuild) so that metadata for tags that did not exist when the snapshot
/// was first applied gets picked up.
pub fn reapply_stored_tag_metadata(conn: &Connection) -> Result<(), AppError> {
    let json: Option<String> = conn
        .query_row(
            "SELECT value FROM app_settings WHERE key = 'tag_metadata_stored_payload'",
            [],
            |row| row.get(0),
        )
        .optional()?
        .flatten();

    if let Some(json) = json {
        let payload = TagMetadataSnapshotPayload::from_canonical_json(&json)?;
        apply_tag_metadata_entries(conn, &payload)?;
    }
    Ok(())
}

fn stored_event_id_for_tag_metadata(conn: &Connection) -> String {
    conn.query_row(
        "SELECT snapshot_id FROM sync_snapshots
         WHERE d_tag = ?1
         ORDER BY mtime DESC LIMIT 1",
        params![COMET_TAG_METADATA_D_TAG],
        |row| row.get::<_, String>(0),
    )
    .unwrap_or_default()
}


#[cfg(test)]
mod tests {
    use super::*;
    use crate::adapters::nostr::comet_note_snapshot::NoteSnapshotEventMeta;
    use crate::adapters::nostr::comet_tag_metadata_snapshot::{
        build_tag_metadata_snapshot_event, TagMetadataEntry, TagMetadataSnapshotPayload,
        COMET_TAG_METADATA_COLLECTION, COMET_TAG_METADATA_D_TAG,
        COMET_TAG_METADATA_SNAPSHOT_VERSION,
    };
    use crate::adapters::sqlite::migrations::account_migrations;
    use std::collections::BTreeMap;

    fn setup_db() -> Connection {
        let mut conn = Connection::open_in_memory().unwrap();
        account_migrations().to_latest(&mut conn).unwrap();
        conn
    }

    fn make_tag_metadata_event(
        keys: &Keys,
        tags: BTreeMap<String, TagMetadataEntry>,
        vector_clock: BTreeMap<String, u64>,
        created_at_ms: i64,
    ) -> Event {
        let payload = TagMetadataSnapshotPayload {
            version: COMET_TAG_METADATA_SNAPSHOT_VERSION,
            device_id: "DEVICE-A".to_string(),
            vector_clock,
            tags,
        };
        build_tag_metadata_snapshot_event(
            keys,
            &NoteSnapshotEventMeta {
                document_id: COMET_TAG_METADATA_D_TAG.to_string(),
                operation: "put".to_string(),
                collection: Some(COMET_TAG_METADATA_COLLECTION.to_string()),
                created_at_ms: Some(created_at_ms),
            },
            &payload,
        )
        .unwrap()
    }

    fn insert_tag(conn: &Connection, path: &str) {
        conn.execute(
            "INSERT OR IGNORE INTO tags (path, last_segment, depth, pinned, hide_subtag_notes, created_at, updated_at)
             VALUES (?1, ?1, 1, 0, 0, 1000, 1000)",
            params![path],
        )
        .unwrap();
    }

    #[test]
    fn applies_remote_tag_metadata_when_local_is_empty() {
        let conn = setup_db();
        let keys = Keys::generate();

        insert_tag(&conn, "work");
        insert_tag(&conn, "recipes");

        let tags = BTreeMap::from([
            (
                "work".to_string(),
                TagMetadataEntry {
                    pinned: true,
                    icon: None,
                },
            ),
            (
                "recipes".to_string(),
                TagMetadataEntry {
                    pinned: true,
                    icon: Some("utensils".to_string()),
                },
            ),
        ]);
        let event = make_tag_metadata_event(
            &keys,
            tags,
            BTreeMap::from([("DEVICE-A".to_string(), 1)]),
            1000,
        );

        let applied = apply_remote_tag_metadata_snapshot(
            &conn,
            "wss://relay.example",
            &keys,
            &event,
            Some(1),
        )
        .unwrap();

        assert!(applied);

        let pinned: i32 = conn
            .query_row(
                "SELECT pinned FROM tags WHERE path = 'work'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(pinned, 1);

        let icon: Option<String> = conn
            .query_row(
                "SELECT icon FROM tags WHERE path = 'recipes'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(icon, Some("utensils".to_string()));
    }

    #[test]
    fn rejects_dominated_tag_metadata_snapshot() {
        let conn = setup_db();
        let keys = Keys::generate();

        // Set local clock to a higher value
        conn.execute(
            "INSERT OR REPLACE INTO app_settings (key, value) VALUES ('tag_metadata_vector_clock', '{\"DEVICE-A\": 5}')",
            [],
        )
        .unwrap();

        insert_tag(&conn, "work");

        let tags = BTreeMap::from([(
            "work".to_string(),
            TagMetadataEntry {
                pinned: true,
                icon: None,
            },
        )]);
        let event = make_tag_metadata_event(
            &keys,
            tags,
            BTreeMap::from([("DEVICE-A".to_string(), 3)]),
            1000,
        );

        let applied = apply_remote_tag_metadata_snapshot(
            &conn,
            "wss://relay.example",
            &keys,
            &event,
            Some(2),
        )
        .unwrap();

        assert!(!applied);

        let pinned: i32 = conn
            .query_row(
                "SELECT pinned FROM tags WHERE path = 'work'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(pinned, 0); // Unchanged
    }

    #[test]
    fn concurrent_clocks_higher_sum_wins() {
        let conn = setup_db();
        let keys = Keys::generate();

        // Local: DEVICE-A=3, DEVICE-B=1 (sum=4)
        conn.execute(
            "INSERT OR REPLACE INTO app_settings (key, value) VALUES ('tag_metadata_vector_clock', '{\"DEVICE-A\": 3, \"DEVICE-B\": 1}')",
            [],
        )
        .unwrap();

        insert_tag(&conn, "work");

        // Incoming: DEVICE-A=2, DEVICE-B=4 (sum=6 > 4)
        let tags = BTreeMap::from([(
            "work".to_string(),
            TagMetadataEntry {
                pinned: true,
                icon: None,
            },
        )]);
        let event = make_tag_metadata_event(
            &keys,
            tags,
            BTreeMap::from([("DEVICE-A".to_string(), 2), ("DEVICE-B".to_string(), 4)]),
            1000,
        );

        let applied = apply_remote_tag_metadata_snapshot(
            &conn,
            "wss://relay.example",
            &keys,
            &event,
            Some(3),
        )
        .unwrap();

        assert!(applied);
    }

    #[test]
    fn resets_tags_not_in_payload_to_defaults() {
        let conn = setup_db();
        let keys = Keys::generate();

        insert_tag(&conn, "work");
        // Manually pin it
        conn.execute("UPDATE tags SET pinned = 1 WHERE path = 'work'", [])
            .unwrap();

        // Send empty tag metadata (no tags in payload)
        let event = make_tag_metadata_event(
            &keys,
            BTreeMap::new(),
            BTreeMap::from([("DEVICE-A".to_string(), 1)]),
            1000,
        );

        let applied = apply_remote_tag_metadata_snapshot(
            &conn,
            "wss://relay.example",
            &keys,
            &event,
            Some(1),
        )
        .unwrap();

        assert!(applied);

        let pinned: i32 = conn
            .query_row(
                "SELECT pinned FROM tags WHERE path = 'work'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(pinned, 0); // Reset to default
    }
}

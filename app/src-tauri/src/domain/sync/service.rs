pub use crate::domain::sync::conflict_store::clear_note_conflicts;
pub use crate::domain::sync::note_apply::upsert_from_sync;
pub use crate::domain::sync::tombstone_apply::{
    tombstone_note_locally, upsert_tombstone_from_sync,
};

#[cfg(test)]
mod tests {
    use super::*;
    use crate::adapters::sqlite::migrations::account_migrations;
    use crate::domain::sync::model::{SyncedNote, SyncedTombstone};
    use crate::domain::sync::vector_clock::VectorClock;
    use rusqlite::{params, Connection};

    fn setup_db() -> Connection {
        let mut conn = Connection::open_in_memory().unwrap();
        account_migrations().to_latest(&mut conn).unwrap();
        conn
    }

    fn make_synced_note(id: &str, modified_at: i64) -> SyncedNote {
        SyncedNote {
            id: id.to_string(),
            device_id: "DEVICE-A".to_string(),
            vector_clock: VectorClock::from([("DEVICE-A".to_string(), 1)]),
            title: format!("Title {id}"),
            markdown: format!("# Title {id}\n\nBody"),
            created_at: 1000,
            modified_at,
            edited_at: modified_at,
            archived_at: None,
            deleted_at: None,
            pinned_at: None,
            readonly: false,
            tags: vec![],
            wikilink_resolutions: vec![],
        }
    }

    fn make_synced_tombstone(id: &str, deleted_at: i64) -> SyncedTombstone {
        SyncedTombstone {
            id: id.to_string(),
            device_id: "DEVICE-A".to_string(),
            vector_clock: VectorClock::from([("DEVICE-A".to_string(), 2)]),
            deleted_at,
        }
    }

    #[test]
    fn upsert_inserts_new_note() {
        let conn = setup_db();
        let note = make_synced_note("note-1", 2000);

        let result = upsert_from_sync(&conn, &note, "evt-1").unwrap();
        assert_eq!(result, Some("note-1".to_string()));

        let title: String = conn
            .query_row("SELECT title FROM notes WHERE id = 'note-1'", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(title, "Title note-1");
    }

    #[test]
    fn upsert_updates_when_remote_is_newer() {
        let conn = setup_db();
        conn.execute(
            "INSERT INTO notes (id, title, markdown, created_at, modified_at, edited_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params!["note-1", "Old Title", "Old body", 1000, 2000, 2000],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO notes_fts (note_id, title, markdown) VALUES (?1, ?2, ?3)",
            params!["note-1", "Old Title", "Old body"],
        )
        .unwrap();

        let note = make_synced_note("note-1", 3000);
        let result = upsert_from_sync(&conn, &note, "evt-2").unwrap();
        assert_eq!(result, Some("note-1".to_string()));

        let title: String = conn
            .query_row("SELECT title FROM notes WHERE id = 'note-1'", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(title, "Title note-1");
    }

    #[test]
    fn upsert_stores_concurrent_remote_snapshot_as_conflict() {
        let conn = setup_db();
        conn.execute(
            "INSERT INTO notes (id, title, markdown, created_at, modified_at, edited_at, last_edit_device_id, vector_clock)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                "note-1",
                "Local Title",
                "# Local Title\n\nLocal body",
                1000,
                2000,
                2000,
                "DEVICE-A",
                "{\"DEVICE-A\":2}"
            ],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO notes_fts (note_id, title, markdown) VALUES (?1, ?2, ?3)",
            params!["note-1", "Local Title", "# Local Title\n\nLocal body"],
        )
        .unwrap();

        let mut note = make_synced_note("note-1", 3000);
        note.device_id = "DEVICE-B".to_string();
        note.vector_clock =
            VectorClock::from([("DEVICE-A".to_string(), 1), ("DEVICE-B".to_string(), 1)]);
        note.title = "Remote Title".to_string();
        note.markdown = "# Remote Title\n\nRemote body".to_string();

        let result = upsert_from_sync(&conn, &note, "evt-conflict-1").unwrap();
        assert_eq!(result, None);

        let title: String = conn
            .query_row("SELECT title FROM notes WHERE id = 'note-1'", [], |row| {
                row.get(0)
            })
            .unwrap();
        let conflict_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM note_conflicts WHERE note_id = 'note-1'",
                [],
                |row| row.get(0),
            )
            .unwrap();

        assert_eq!(title, "Local Title");
        assert_eq!(conflict_count, 1);
    }

    #[test]
    fn local_tombstone_moves_note_into_graveyard() {
        let conn = setup_db();
        conn.execute(
            "INSERT INTO notes (id, title, markdown, created_at, modified_at, edited_at, vector_clock)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                "note-1",
                "Title",
                "# Title\n\nBody",
                1000,
                2000,
                2000,
                "{\"DEVICE-A\":1}"
            ],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO notes_fts (note_id, title, markdown) VALUES (?1, ?2, ?3)",
            params!["note-1", "Title", "# Title\n\nBody"],
        )
        .unwrap();

        let tombstoned = tombstone_note_locally(&conn, "note-1", 3000).unwrap();
        assert!(tombstoned);

        let notes_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM notes WHERE id = 'note-1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let tombstone_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM note_tombstones WHERE id = 'note-1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let fts_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM notes_fts WHERE note_id = 'note-1'",
                [],
                |row| row.get(0),
            )
            .unwrap();

        assert_eq!(notes_count, 0);
        assert_eq!(tombstone_count, 1);
        assert_eq!(fts_count, 0);
    }

    #[test]
    fn upsert_overwrites_clean_local_note_even_if_remote_timestamp_is_older() {
        let conn = setup_db();
        conn.execute(
            "INSERT INTO notes (id, title, markdown, created_at, modified_at, edited_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params!["note-1", "Local Title", "Local body", 1000, 5000, 5000],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO notes_fts (note_id, title, markdown) VALUES (?1, ?2, ?3)",
            params!["note-1", "Local Title", "Local body"],
        )
        .unwrap();

        let note = make_synced_note("note-1", 3000);
        let result = upsert_from_sync(&conn, &note, "evt-3").unwrap();
        assert_eq!(result, Some("note-1".to_string()));

        let title: String = conn
            .query_row("SELECT title FROM notes WHERE id = 'note-1'", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(title, "Title note-1");
    }

    #[test]
    fn upsert_skips_when_local_note_is_dirty() {
        let conn = setup_db();
        conn.execute(
            "INSERT INTO notes (id, title, markdown, created_at, modified_at, edited_at, locally_modified) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1)",
            params!["note-1", "Local Title", "Local body", 1000, 5000, 5000],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO notes_fts (note_id, title, markdown) VALUES (?1, ?2, ?3)",
            params!["note-1", "Local Title", "Local body"],
        )
        .unwrap();

        let note = make_synced_note("note-1", 9000);
        let result = upsert_from_sync(&conn, &note, "evt-4").unwrap();
        assert_eq!(result, None);

        let title: String = conn
            .query_row("SELECT title FROM notes WHERE id = 'note-1'", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(title, "Local Title");
    }

    #[test]
    fn tombstone_replaces_note_and_clears_materialized_state() {
        let conn = setup_db();
        conn.execute(
            "INSERT INTO notes (id, title, markdown, created_at, modified_at, edited_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params!["note-1", "Title", "Body", 1000, 2000, 2000],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO notes_fts (note_id, title, markdown) VALUES (?1, ?2, ?3)",
            params!["note-1", "Title", "Body"],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO pending_deletions (entity_id, created_at) VALUES (?1, ?2)",
            params!["note-1", 3000],
        )
        .unwrap();

        let mut invalidated: Option<String> = None;
        let result = upsert_tombstone_from_sync(
            &conn,
            &make_synced_tombstone("note-1", 3000),
            "evt-del-1",
            |id: &str| {
                invalidated = Some(id.to_string());
            },
        )
        .unwrap();

        let notes_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM notes", [], |row| row.get(0))
            .unwrap();
        let fts_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM notes_fts", [], |row| row.get(0))
            .unwrap();
        let pending_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM pending_deletions", [], |row| {
                row.get(0)
            })
            .unwrap();
        let tombstone_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM note_tombstones", [], |row| row.get(0))
            .unwrap();

        assert_eq!(result, Some("note-1".to_string()));
        assert_eq!(notes_count, 0);
        assert_eq!(fts_count, 0);
        assert_eq!(pending_count, 0);
        assert_eq!(tombstone_count, 1);
        assert_eq!(invalidated.as_deref(), Some("note-1"));
    }

    #[test]
    fn concurrent_remote_tombstone_is_stored_as_conflict_without_deleting_note() {
        let conn = setup_db();
        conn.execute(
            "INSERT INTO notes (id, title, markdown, created_at, modified_at, edited_at, last_edit_device_id, vector_clock)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                "note-1",
                "Local Title",
                "# Local Title\n\nLocal body",
                1000,
                2000,
                2000,
                "DEVICE-A",
                "{\"DEVICE-A\":2}"
            ],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO notes_fts (note_id, title, markdown) VALUES (?1, ?2, ?3)",
            params!["note-1", "Local Title", "# Local Title\n\nLocal body"],
        )
        .unwrap();

        let tombstone = SyncedTombstone {
            id: "note-1".to_string(),
            device_id: "DEVICE-B".to_string(),
            vector_clock: VectorClock::from([
                ("DEVICE-A".to_string(), 1),
                ("DEVICE-B".to_string(), 1),
            ]),
            deleted_at: 3000,
        };

        let result =
            upsert_tombstone_from_sync(&conn, &tombstone, "evt-del-conflict", |_| {}).unwrap();
        assert_eq!(result, Some("note-1".to_string()));

        let note_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM notes WHERE id = 'note-1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let tombstone_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM note_tombstones WHERE id = 'note-1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let conflict_row: (String, Option<i64>) = conn
            .query_row(
                "SELECT op, deleted_at FROM note_conflicts WHERE snapshot_event_id = 'evt-del-conflict'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();

        assert_eq!(note_count, 1);
        assert_eq!(tombstone_count, 0);
        assert_eq!(conflict_row.0, "del");
        assert_eq!(conflict_row.1, Some(3000));
    }

    #[test]
    fn upsert_remote_note_clears_stale_tombstone_and_pending_delete() {
        let conn = setup_db();
        conn.execute(
            "INSERT INTO note_tombstones (id, deleted_at, last_edit_device_id, vector_clock, locally_modified)
             VALUES (?1, ?2, ?3, ?4, 1)",
            params!["note-1", 3000, "DEVICE-A", "{\"DEVICE-A\":1}"],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO pending_deletions (entity_id, created_at) VALUES (?1, ?2)",
            params!["note-1", 3000],
        )
        .unwrap();

        let mut note = make_synced_note("note-1", 4000);
        note.vector_clock = VectorClock::from([("DEVICE-A".to_string(), 2)]);

        let result = upsert_from_sync(&conn, &note, "evt-remote-put").unwrap();
        assert_eq!(result, Some("note-1".to_string()));

        let tombstone_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM note_tombstones WHERE id = 'note-1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let pending_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM pending_deletions WHERE entity_id = 'note-1'",
                [],
                |row| row.get(0),
            )
            .unwrap();

        assert_eq!(tombstone_count, 0);
        assert_eq!(pending_count, 0);
    }

    #[test]
    fn concurrent_remote_note_restores_note_and_preserves_tombstone_as_conflict() {
        let conn = setup_db();
        conn.execute(
            "INSERT INTO note_tombstones (id, deleted_at, last_edit_device_id, vector_clock, snapshot_event_id, locally_modified)
             VALUES (?1, ?2, ?3, ?4, ?5, 0)",
            params![
                "note-1",
                3000,
                "DEVICE-A",
                "{\"DEVICE-A\":2}",
                "evt-del-local"
            ],
        )
        .unwrap();

        let mut note = make_synced_note("note-1", 4000);
        note.device_id = "DEVICE-B".to_string();
        note.vector_clock =
            VectorClock::from([("DEVICE-A".to_string(), 1), ("DEVICE-B".to_string(), 1)]);

        let result = upsert_from_sync(&conn, &note, "evt-remote-put").unwrap();
        assert_eq!(result, Some("note-1".to_string()));

        let note_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM notes WHERE id = 'note-1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let tombstone_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM note_tombstones WHERE id = 'note-1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let conflict_row: (String, Option<i64>) = conn
            .query_row(
                "SELECT op, deleted_at FROM note_conflicts WHERE snapshot_event_id = 'evt-del-local'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();

        assert_eq!(note_count, 1);
        assert_eq!(tombstone_count, 0);
        assert_eq!(conflict_row.0, "del");
        assert_eq!(conflict_row.1, Some(3000));
    }

    #[test]
    fn local_tombstone_merges_conflict_clock_before_incrementing() {
        let conn = setup_db();
        conn.execute(
            "INSERT INTO app_settings (key, value) VALUES ('sync_device_id', 'DEVICE-A')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO notes (id, title, markdown, created_at, modified_at, edited_at, last_edit_device_id, vector_clock)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                "note-1",
                "Title",
                "# Title\n\nBody",
                1000,
                2000,
                2000,
                "DEVICE-A",
                "{\"DEVICE-A\":1}"
            ],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO note_conflicts
               (snapshot_event_id, note_id, op, device_id, vector_clock, title, markdown, modified_at, edited_at, deleted_at, archived_at, pinned_at, readonly, created_at)
             VALUES
               ('evt-conflict-b', 'note-1', 'put', 'DEVICE-B', '{\"DEVICE-B\":1}', 'Conflict', '# Conflict', 3000, 3000, NULL, NULL, NULL, 0, 1000)",
            [],
        )
        .unwrap();

        let tombstoned = tombstone_note_locally(&conn, "note-1", 4000).unwrap();
        assert!(tombstoned);

        let tombstone_clock: String = conn
            .query_row(
                "SELECT vector_clock FROM note_tombstones WHERE id = 'note-1'",
                [],
                |row| row.get(0),
            )
            .unwrap();

        assert_eq!(tombstone_clock, "{\"DEVICE-A\":2,\"DEVICE-B\":1}");
    }

    #[test]
    fn upsert_clears_only_conflicts_dominated_by_incoming_resolution() {
        let conn = setup_db();
        conn.execute(
            "INSERT INTO notes (id, title, markdown, created_at, modified_at, edited_at, last_edit_device_id, vector_clock)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                "note-1",
                "Local Title",
                "# Local Title\n\nLocal body",
                1000,
                2000,
                2000,
                "DEVICE-B",
                "{\"DEVICE-B\":1}"
            ],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO notes_fts (note_id, title, markdown) VALUES (?1, ?2, ?3)",
            params!["note-1", "Local Title", "# Local Title\n\nLocal body"],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO note_conflicts
               (snapshot_event_id, note_id, op, device_id, vector_clock, title, markdown, modified_at, edited_at, deleted_at, archived_at, pinned_at, readonly, created_at)
             VALUES
               ('evt-conflict-a', 'note-1', 'put', 'DEVICE-A', '{\"DEVICE-A\":1}', 'Conflict A', '# Conflict A', 2500, 2500, NULL, NULL, NULL, 0, 1000),
               ('evt-conflict-c', 'note-1', 'put', 'DEVICE-C', '{\"DEVICE-C\":1}', 'Conflict C', '# Conflict C', 2600, 2600, NULL, NULL, NULL, 0, 1000)",
            [],
        )
        .unwrap();

        let mut note = make_synced_note("note-1", 4000);
        note.device_id = "DEVICE-A".to_string();
        note.vector_clock =
            VectorClock::from([("DEVICE-A".to_string(), 2), ("DEVICE-B".to_string(), 1)]);
        note.title = "Resolved Title".to_string();
        note.markdown = "# Resolved Title\n\nResolved body".to_string();

        let result = upsert_from_sync(&conn, &note, "evt-resolution").unwrap();
        assert_eq!(result, Some("note-1".to_string()));

        let remaining_conflicts: Vec<String> = {
            let mut stmt = conn
                .prepare(
                    "SELECT snapshot_event_id
                     FROM note_conflicts
                     WHERE note_id = 'note-1'
                     ORDER BY snapshot_event_id ASC",
                )
                .unwrap();
            stmt.query_map([], |row| row.get::<_, String>(0))
                .unwrap()
                .collect::<Result<Vec<_>, _>>()
                .unwrap()
        };

        assert_eq!(remaining_conflicts, vec!["evt-conflict-c".to_string()]);
    }
}

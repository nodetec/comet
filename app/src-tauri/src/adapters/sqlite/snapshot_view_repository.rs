use crate::domain::common::text::preview_from_markdown;
use crate::domain::notes::model::{
    NoteConflictInfo, NoteConflictSnapshot, NoteHistoryInfo, NoteHistorySnapshot,
    WikiLinkResolutionInput,
};
use crate::error::AppError;
use rusqlite::{params, Connection, OptionalExtension};
use std::collections::HashSet;

#[derive(Debug, Clone, PartialEq, Eq)]
struct SnapshotViewRow {
    snapshot_id: String,
    op: String,
    mtime: i64,
    deleted_at: Option<i64>,
    title: Option<String>,
    markdown: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct CurrentSnapshotState {
    current_snapshot_id: Option<String>,
    materialized_snapshot: Option<SnapshotViewRow>,
}

pub struct SqliteSnapshotViewRepository<'a> {
    conn: &'a Connection,
}

impl<'a> SqliteSnapshotViewRepository<'a> {
    pub fn new(conn: &'a Connection) -> Self {
        Self { conn }
    }

    pub fn get_note_history(&self, note_id: &str) -> Result<NoteHistoryInfo, AppError> {
        let current = self.load_current_snapshot_state(note_id)?;
        let conflict_ids = self.load_conflict_snapshot_ids(note_id)?;

        let mut stmt = self.conn.prepare(
            "SELECT snapshot_event_id, op, modified_at, deleted_at, title, markdown
             FROM note_snapshot_history
             WHERE note_id = ?1
             ORDER BY modified_at DESC, snapshot_event_id ASC",
        )?;
        let rows = stmt.query_map(params![note_id], Self::read_snapshot_view_row)?;

        let mut snapshots = Vec::new();
        for row in rows {
            let row = row?;
            let wikilink_resolutions =
                self.load_note_history_snapshot_wikilink_resolutions(&row.snapshot_id)?;
            snapshots.push(NoteHistorySnapshot {
                is_current: current.current_snapshot_id.as_ref() == Some(&row.snapshot_id),
                is_conflict: conflict_ids.contains(&row.snapshot_id),
                snapshot_id: row.snapshot_id,
                op: row.op,
                mtime: row.mtime,
                deleted_at: row.deleted_at,
                title: row.title,
                preview: row
                    .markdown
                    .as_ref()
                    .map(|value| preview_from_markdown(value)),
                markdown: row.markdown,
                wikilink_resolutions,
            });
        }

        Ok(NoteHistoryInfo {
            note_id: note_id.to_string(),
            snapshot_count: snapshots.len(),
            snapshots,
        })
    }

    pub fn get_note_conflict(&self, note_id: &str) -> Result<Option<NoteConflictInfo>, AppError> {
        let current = self.load_current_snapshot_state(note_id)?;
        let mut snapshots = Vec::new();

        if let Some(current_row) = current.materialized_snapshot {
            snapshots.push(self.conflict_snapshot_from_row(note_id, current_row, true)?);
        }

        let mut stmt = self.conn.prepare(
            "SELECT snapshot_event_id, op, modified_at, deleted_at, title, markdown
             FROM note_conflicts
             WHERE note_id = ?1
             ORDER BY modified_at DESC, snapshot_event_id ASC",
        )?;
        let rows = stmt.query_map(params![note_id], Self::read_snapshot_view_row)?;
        for row in rows {
            snapshots.push(self.conflict_snapshot_from_row(note_id, row?, false)?);
        }

        if snapshots.len() <= 1 {
            return Ok(None);
        }

        let has_delete_candidate = snapshots.iter().any(|snapshot| snapshot.op == "del");
        snapshots.sort_by(|left, right| {
            right
                .is_current
                .cmp(&left.is_current)
                .then_with(|| right.is_available.cmp(&left.is_available))
                .then_with(|| right.mtime.cmp(&left.mtime))
                .then_with(|| left.snapshot_id.cmp(&right.snapshot_id))
        });

        Ok(Some(NoteConflictInfo {
            note_id: note_id.to_string(),
            current_snapshot_id: current.current_snapshot_id,
            snapshot_count: snapshots.len(),
            relay_url: None,
            has_delete_candidate,
            snapshots,
        }))
    }

    fn load_current_snapshot_state(&self, note_id: &str) -> Result<CurrentSnapshotState, AppError> {
        let current_note: Option<(Option<String>, String, String, i64)> = self
            .conn
            .query_row(
                "SELECT snapshot_event_id, title, markdown, modified_at
                 FROM notes
                 WHERE id = ?1",
                params![note_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .optional()?;

        if let Some((snapshot_event_id, title, markdown, modified_at)) = current_note {
            let snapshot_id = snapshot_event_id
                .clone()
                .unwrap_or_else(|| format!("local:{note_id}"));
            return Ok(CurrentSnapshotState {
                current_snapshot_id: Some(snapshot_id.clone()),
                materialized_snapshot: Some(SnapshotViewRow {
                    snapshot_id,
                    op: "put".to_string(),
                    mtime: modified_at,
                    deleted_at: None,
                    title: Some(title),
                    markdown: Some(markdown),
                }),
            });
        }

        let current_tombstone: Option<(Option<String>, i64)> = self
            .conn
            .query_row(
                "SELECT snapshot_event_id, deleted_at
                 FROM note_tombstones
                 WHERE id = ?1",
                params![note_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()?;

        if let Some((snapshot_event_id, deleted_at)) = current_tombstone {
            let snapshot_id = snapshot_event_id
                .clone()
                .unwrap_or_else(|| format!("local-deleted:{note_id}"));
            return Ok(CurrentSnapshotState {
                current_snapshot_id: Some(snapshot_id.clone()),
                materialized_snapshot: Some(SnapshotViewRow {
                    snapshot_id,
                    op: "del".to_string(),
                    mtime: deleted_at,
                    deleted_at: Some(deleted_at),
                    title: None,
                    markdown: None,
                }),
            });
        }

        Ok(CurrentSnapshotState {
            current_snapshot_id: None,
            materialized_snapshot: None,
        })
    }

    fn load_conflict_snapshot_ids(&self, note_id: &str) -> Result<HashSet<String>, AppError> {
        let mut conflict_ids = HashSet::new();
        let mut stmt = self.conn.prepare(
            "SELECT snapshot_event_id
             FROM note_conflicts
             WHERE note_id = ?1",
        )?;
        let rows = stmt.query_map(params![note_id], |row| row.get::<_, String>(0))?;
        for row in rows {
            conflict_ids.insert(row?);
        }
        Ok(conflict_ids)
    }

    fn load_note_history_snapshot_wikilink_resolutions(
        &self,
        snapshot_id: &str,
    ) -> Result<Vec<WikiLinkResolutionInput>, AppError> {
        let mut stmt = self.conn.prepare(
            "SELECT occurrence_id, location, title, target_note_id
             FROM note_snapshot_history_wikilinks
             WHERE snapshot_event_id = ?1
             ORDER BY location ASC, occurrence_id ASC",
        )?;
        let rows = stmt.query_map(params![snapshot_id], |row| {
            Ok(WikiLinkResolutionInput {
                occurrence_id: row.get(0)?,
                is_explicit: true,
                location: row.get::<_, i64>(1)? as usize,
                title: row.get(2)?,
                target_note_id: row.get(3)?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    fn read_snapshot_view_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<SnapshotViewRow> {
        Ok(SnapshotViewRow {
            snapshot_id: row.get(0)?,
            op: row.get(1)?,
            mtime: row.get(2)?,
            deleted_at: row.get(3)?,
            title: row.get(4)?,
            markdown: row.get(5)?,
        })
    }

    fn conflict_snapshot_from_row(
        &self,
        note_id: &str,
        row: SnapshotViewRow,
        is_current: bool,
    ) -> Result<NoteConflictSnapshot, AppError> {
        let wikilink_resolutions = self.load_conflict_snapshot_wikilink_resolutions(
            note_id,
            &row.snapshot_id,
            is_current,
        )?;
        Ok(NoteConflictSnapshot {
            snapshot_id: row.snapshot_id,
            op: row.op,
            mtime: row.mtime,
            deleted_at: row.deleted_at,
            title: row.title,
            preview: row
                .markdown
                .as_ref()
                .map(|value| preview_from_markdown(value)),
            markdown: row.markdown,
            is_current,
            is_available: true,
            wikilink_resolutions,
        })
    }

    fn load_conflict_snapshot_wikilink_resolutions(
        &self,
        note_id: &str,
        snapshot_id: &str,
        is_current: bool,
    ) -> Result<Vec<WikiLinkResolutionInput>, AppError> {
        let sql = if is_current {
            "SELECT l.occurrence_id, l.location, l.title, l.target_note_id
             FROM note_wikilinks l
             JOIN notes n ON n.id = l.target_note_id
             WHERE l.source_note_id = ?1
               AND l.target_note_id IS NOT NULL
               AND l.is_explicit = 1
               AND n.deleted_at IS NULL
             ORDER BY l.location ASC, l.occurrence_id ASC"
        } else {
            "SELECT occurrence_id, location, title, target_note_id
             FROM note_conflict_wikilinks
             WHERE snapshot_event_id = ?1
             ORDER BY location ASC, occurrence_id ASC"
        };
        let lookup_id = if is_current { note_id } else { snapshot_id };
        let mut stmt = self.conn.prepare(sql)?;
        let rows = stmt.query_map(params![lookup_id], |row| {
            Ok(WikiLinkResolutionInput {
                occurrence_id: row.get(0)?,
                is_explicit: true,
                location: row.get::<_, i64>(1)? as usize,
                title: row.get(2)?,
                target_note_id: row.get(3)?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::adapters::sqlite::migrations::account_migrations;

    #[test]
    fn get_note_history_includes_snapshot_wikilink_resolutions() {
        let mut conn = Connection::open_in_memory().unwrap();
        account_migrations().to_latest(&mut conn).unwrap();

        conn.execute(
            "INSERT INTO note_snapshot_history
               (snapshot_event_id, note_id, op, device_id, vector_clock, title, markdown, modified_at, edited_at, deleted_at, archived_at, pinned_at, readonly, created_at)
             VALUES
               ('snapshot-1', 'note-1', 'put', 'DEVICE-A', '{\"DEVICE-A\":1}', 'Title', '# Title\n\n[[Alpha]]', 1, 1, NULL, NULL, NULL, 0, 1)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO note_snapshot_history_wikilinks
               (snapshot_event_id, occurrence_id, location, title, target_note_id)
             VALUES
               ('snapshot-1', 'HIST1', 10, 'Alpha', 'history-target')",
            [],
        )
        .unwrap();

        let repo = SqliteSnapshotViewRepository::new(&conn);
        let history = repo.get_note_history("note-1").unwrap();

        assert_eq!(history.snapshots.len(), 1);
        assert_eq!(history.snapshots[0].wikilink_resolutions.len(), 1);
        assert_eq!(
            history.snapshots[0].wikilink_resolutions[0].target_note_id,
            "history-target"
        );
    }

    #[test]
    fn get_note_conflict_includes_snapshot_wikilink_resolutions() {
        let mut conn = Connection::open_in_memory().unwrap();
        account_migrations().to_latest(&mut conn).unwrap();

        conn.execute(
            "INSERT INTO notes
               (id, title, markdown, created_at, modified_at, edited_at, locally_modified)
             VALUES
               ('note-1', 'Title', '# Title\n\n[[Alpha]]', 1, 1, 1, 1),
               ('current-target', 'Alpha', '# Alpha', 1, 1, 1, 1)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO note_wikilinks
               (source_note_id, occurrence_id, location, title, normalized_title, target_note_id, is_explicit)
             VALUES
               ('note-1', 'CURRENT1', 10, 'Alpha', 'alpha', 'current-target', 1)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO note_conflicts
               (snapshot_event_id, note_id, op, device_id, vector_clock, title, markdown, modified_at, edited_at, deleted_at, archived_at, pinned_at, readonly, created_at)
             VALUES
               ('evt-conflict', 'note-1', 'put', 'DEVICE-B', '{\"DEVICE-B\":1}', 'Title', '# Title\n\n[[Alpha]]', 2, 2, NULL, NULL, NULL, 0, 1)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO note_conflict_wikilinks
               (snapshot_event_id, occurrence_id, location, title, target_note_id)
             VALUES
               ('evt-conflict', 'CONFLICT1', 10, 'Alpha', 'conflict-target')",
            [],
        )
        .unwrap();

        let repo = SqliteSnapshotViewRepository::new(&conn);
        let conflict = repo.get_note_conflict("note-1").unwrap().unwrap();

        let current_snapshot = conflict
            .snapshots
            .iter()
            .find(|snapshot| snapshot.is_current)
            .unwrap();
        assert_eq!(current_snapshot.wikilink_resolutions.len(), 1);
        assert_eq!(
            current_snapshot.wikilink_resolutions[0].target_note_id,
            "current-target"
        );

        let remote_snapshot = conflict
            .snapshots
            .iter()
            .find(|snapshot| snapshot.snapshot_id == "evt-conflict")
            .unwrap();
        assert_eq!(remote_snapshot.wikilink_resolutions.len(), 1);
        assert_eq!(
            remote_snapshot.wikilink_resolutions[0].target_note_id,
            "conflict-target"
        );
    }
}

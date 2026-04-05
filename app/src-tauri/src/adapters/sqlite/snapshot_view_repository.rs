use crate::domain::common::text::preview_from_markdown;
use crate::domain::notes::model::{
    NoteConflictInfo, NoteConflictSnapshot, NoteHistoryInfo, NoteHistorySnapshot,
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
            snapshots.push(self.conflict_snapshot_from_row(current_row, true));
        }

        let mut stmt = self.conn.prepare(
            "SELECT snapshot_event_id, op, modified_at, deleted_at, title, markdown
             FROM note_conflicts
             WHERE note_id = ?1
             ORDER BY modified_at DESC, snapshot_event_id ASC",
        )?;
        let rows = stmt.query_map(params![note_id], Self::read_snapshot_view_row)?;
        for row in rows {
            snapshots.push(self.conflict_snapshot_from_row(row?, false));
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
        row: SnapshotViewRow,
        is_current: bool,
    ) -> NoteConflictSnapshot {
        NoteConflictSnapshot {
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
        }
    }
}

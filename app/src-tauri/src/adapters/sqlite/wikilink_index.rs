use std::collections::{BTreeSet, HashMap, HashSet, VecDeque};
use std::time::Instant;

use rusqlite::{params, Connection, OptionalExtension};
use uuid::Uuid;

use crate::domain::common::text::{
    extract_wikilink_occurrences, normalize_wikilink_title, WikiLinkOccurrence,
};
use crate::domain::notes::model::WikiLinkResolutionInput;
use crate::error::AppError;

const WIKILINK_INDEX_VERSION_KEY: &str = "wikilink_index_version";
const WIKILINK_INDEX_STATUS_KEY: &str = "wikilink_index_status";
const WIKILINK_INDEX_LAST_REBUILT_AT_KEY: &str = "wikilink_index_last_rebuilt_at";
const WIKILINK_INDEX_VERSION: &str = "wikilinks_v1";

#[derive(Clone, Debug)]
struct TitleResolution {
    preferred_note_id: String,
    match_count: usize,
}

#[derive(Clone, Debug)]
struct ExistingOccurrence {
    occurrence_id: String,
    location: usize,
    title: String,
    normalized_title: String,
    target_note_id: Option<String>,
    is_explicit: bool,
}

#[derive(Clone, Debug)]
struct PendingExplicitResolution {
    occurrence_id: Option<String>,
    location: usize,
    title: String,
    target_note_id: String,
}

/// The resolved assignment for a single wikilink occurrence in the markdown.
#[derive(Clone, Debug)]
struct OccurrenceAssignment {
    occurrence_id: String,
    /// Target preserved from a previous index row (may be stale).
    preserved_target: Option<String>,
    /// Target explicitly set by the client in this save.
    explicit_target: Option<String>,
    is_explicit: bool,
}

fn generate_wikilink_occurrence_id() -> String {
    Uuid::new_v4().simple().to_string().to_uppercase()
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

pub fn ensure_wikilink_index_ready(conn: &mut Connection) -> Result<(), AppError> {
    let version = app_setting(conn, WIKILINK_INDEX_VERSION_KEY)?;
    let status = app_setting(conn, WIKILINK_INDEX_STATUS_KEY)?;

    if version.as_deref() == Some(WIKILINK_INDEX_VERSION) && status.as_deref() == Some("ready") {
        return Ok(());
    }

    log::info!(
        "[wikilinks] wikilink index not ready version={:?} status={:?}; starting repair",
        version,
        status
    );
    rebuild_wikilink_index(conn)
}

pub fn rebuild_wikilink_index(conn: &mut Connection) -> Result<(), AppError> {
    let started_at = Instant::now();
    set_app_setting(conn, WIKILINK_INDEX_VERSION_KEY, WIKILINK_INDEX_VERSION)?;
    set_app_setting(conn, WIKILINK_INDEX_STATUS_KEY, "rebuilding")?;

    let transaction = conn.transaction()?;
    clear_wikilink_index(&transaction)?;
    let resolution_map = active_note_title_resolution_map(&transaction)?;

    let notes = {
        let mut statement = transaction.prepare("SELECT id, markdown FROM notes")?;
        let rows = statement.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?;
        rows.collect::<Result<Vec<_>, _>>()?
    };

    log::info!(
        "[wikilinks] rebuilding wikilink index for {} notes",
        notes.len()
    );

    for (note_id, markdown) in notes {
        rebuild_note_wikilink_index_with_resolution_map(
            &transaction,
            &note_id,
            &markdown,
            &[],
            &resolution_map,
        )?;
    }

    transaction.commit()?;

    set_app_setting(conn, WIKILINK_INDEX_STATUS_KEY, "ready")?;
    set_app_setting(
        conn,
        WIKILINK_INDEX_LAST_REBUILT_AT_KEY,
        &crate::domain::common::time::now_millis().to_string(),
    )?;

    log::info!(
        "[wikilinks] wikilink index rebuilt elapsed_ms={}",
        started_at.elapsed().as_millis()
    );

    Ok(())
}

pub fn rebuild_note_wikilink_index(
    conn: &Connection,
    note_id: &str,
    markdown: &str,
    resolutions: &[WikiLinkResolutionInput],
) -> Result<(), rusqlite::Error> {
    let resolution_map = active_note_title_resolution_map(conn)?;
    rebuild_note_wikilink_index_with_resolution_map(
        conn,
        note_id,
        markdown,
        resolutions,
        &resolution_map,
    )
}

pub fn refresh_wikilink_targets(
    conn: &Connection,
    titles: &[String],
) -> Result<(), rusqlite::Error> {
    let normalized_titles = titles
        .iter()
        .filter_map(|title| normalize_wikilink_title(title))
        .collect::<BTreeSet<_>>();
    if normalized_titles.is_empty() {
        return Ok(());
    }

    let resolution_map = active_note_title_resolution_map(conn)?;
    let active_note_ids_by_title = active_note_ids_by_normalized_title(conn)?;

    for normalized_title in normalized_titles {
        let active_note_ids = active_note_ids_by_title
            .get(&normalized_title)
            .cloned()
            .unwrap_or_default();

        let mut stale_rows = {
            let mut statement = conn.prepare(
                "SELECT rowid, target_note_id
                 FROM note_wikilinks
                 WHERE normalized_title = ?1
                   AND target_note_id IS NOT NULL
                   AND is_explicit = 0",
            )?;
            let rows = statement.query_map(params![normalized_title.clone()], |row| {
                Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
            })?;
            rows.collect::<Result<Vec<_>, _>>()?
        };

        stale_rows.retain(|(_, target_note_id)| !active_note_ids.contains(target_note_id));
        for (rowid, _) in stale_rows {
            conn.execute(
                "UPDATE note_wikilinks
                 SET target_note_id = NULL
                 WHERE rowid = ?1",
                params![rowid],
            )?;
        }

        let Some(target_note_id) = resolution_map
            .get(&normalized_title)
            .map(|resolution| resolution.preferred_note_id.clone())
        else {
            continue;
        };
        conn.execute(
            "UPDATE note_wikilinks
             SET target_note_id = ?1
             WHERE normalized_title = ?2
               AND target_note_id IS NULL
               AND is_explicit = 0",
            params![target_note_id, normalized_title],
        )?;
    }

    Ok(())
}

// ---------------------------------------------------------------------------
// Index rebuild
// ---------------------------------------------------------------------------

fn rebuild_note_wikilink_index_with_resolution_map(
    conn: &Connection,
    note_id: &str,
    markdown: &str,
    resolutions: &[WikiLinkResolutionInput],
    resolution_map: &HashMap<String, TitleResolution>,
) -> Result<(), rusqlite::Error> {
    let occurrences = extract_wikilink_occurrences(markdown);
    log::info!(
        "[wikilinks] rebuilding note index note_id={} occurrence_count={} resolution_count={}",
        note_id,
        occurrences.len(),
        resolutions.len()
    );

    let existing_rows = load_existing_occurrences(conn, note_id)?;
    conn.execute(
        "DELETE FROM note_wikilinks WHERE source_note_id = ?1",
        params![note_id],
    )?;

    let occurrence_indices_by_title = group_occurrence_indices_by_title(&occurrences);
    let mut existing_by_title = group_existing_by_title(existing_rows);
    let mut explicit_by_title = group_explicit_by_title(note_id, resolutions);

    // Assign each occurrence an ID and optional target by matching against
    // existing index rows and explicit resolutions from the client.
    let mut assignments: Vec<Option<OccurrenceAssignment>> = vec![None; occurrences.len()];
    for (normalized_title, occurrence_indices) in &occurrence_indices_by_title {
        let existing_for_title = existing_by_title
            .remove(normalized_title)
            .unwrap_or_default();
        let explicit_for_title = explicit_by_title
            .remove(normalized_title)
            .unwrap_or_default();
        assign_occurrences_for_title(
            &occurrences,
            occurrence_indices,
            existing_for_title,
            explicit_for_title,
            &mut assignments,
        );
    }

    // Resolve final targets and insert rows.
    insert_index_rows(conn, note_id, &occurrences, assignments, resolution_map)
}

// ---------------------------------------------------------------------------
// Setup: load and group inputs
// ---------------------------------------------------------------------------

fn load_existing_occurrences(
    conn: &Connection,
    note_id: &str,
) -> Result<Vec<ExistingOccurrence>, rusqlite::Error> {
    let mut statement = conn.prepare(
        "SELECT occurrence_id, location, title, normalized_title, target_note_id, is_explicit
         FROM note_wikilinks
         WHERE source_note_id = ?1",
    )?;
    let rows = statement.query_map(params![note_id], |row| {
        Ok(ExistingOccurrence {
            occurrence_id: row
                .get::<_, Option<String>>(0)?
                .unwrap_or_else(generate_wikilink_occurrence_id),
            location: row.get::<_, i64>(1)? as usize,
            title: row.get(2)?,
            normalized_title: row.get(3)?,
            target_note_id: row.get(4)?,
            is_explicit: row.get::<_, i64>(5)? != 0,
        })
    })?;
    rows.collect()
}

fn group_occurrence_indices_by_title(
    occurrences: &[WikiLinkOccurrence],
) -> HashMap<String, Vec<usize>> {
    let mut map = HashMap::<String, Vec<usize>>::new();
    for (index, occurrence) in occurrences.iter().enumerate() {
        map.entry(occurrence.normalized_title.clone())
            .or_default()
            .push(index);
    }
    map
}

fn group_existing_by_title(
    rows: Vec<ExistingOccurrence>,
) -> HashMap<String, Vec<ExistingOccurrence>> {
    let mut map = HashMap::<String, Vec<ExistingOccurrence>>::new();
    for existing in rows {
        map.entry(existing.normalized_title.clone())
            .or_default()
            .push(existing);
    }
    for group in map.values_mut() {
        group.sort_by(|left, right| {
            left.location
                .cmp(&right.location)
                .then_with(|| left.occurrence_id.cmp(&right.occurrence_id))
                .then_with(|| left.title.cmp(&right.title))
        });
    }
    map
}

fn group_explicit_by_title(
    note_id: &str,
    resolutions: &[WikiLinkResolutionInput],
) -> HashMap<String, Vec<PendingExplicitResolution>> {
    let mut map = HashMap::<String, Vec<PendingExplicitResolution>>::new();
    for resolution in resolutions {
        if !resolution.is_explicit {
            continue;
        }
        let Some(normalized_title) = normalize_wikilink_title(&resolution.title) else {
            log::warn!(
                "[wikilinks] skipping un-normalizable explicit resolution note_id={} occurrence_id={:?} location={} title={} target_note_id={}",
                note_id,
                resolution.occurrence_id,
                resolution.location,
                resolution.title,
                resolution.target_note_id
            );
            continue;
        };
        log::info!(
            "[wikilinks] explicit resolution note_id={} occurrence_id={:?} location={} title={} normalized_title={} target_note_id={}",
            note_id,
            resolution.occurrence_id,
            resolution.location,
            resolution.title,
            normalized_title,
            resolution.target_note_id
        );
        map.entry(normalized_title)
            .or_default()
            .push(PendingExplicitResolution {
                occurrence_id: resolution.occurrence_id.clone(),
                location: resolution.location,
                title: resolution.title.clone(),
                target_note_id: resolution.target_note_id.clone(),
            });
    }
    for group in map.values_mut() {
        group.sort_by(|left, right| {
            left.location
                .cmp(&right.location)
                .then_with(|| left.title.cmp(&right.title))
                .then_with(|| left.occurrence_id.cmp(&right.occurrence_id))
        });
    }
    map
}

// ---------------------------------------------------------------------------
// Core matching: assign occurrence IDs and targets for one title group
// ---------------------------------------------------------------------------

/// For all occurrences of a given normalized title, assign each one an
/// `OccurrenceAssignment` by matching against existing DB rows and explicit
/// client resolutions.
///
/// The algorithm runs in four passes:
///   1. Match by exact location (explicit resolutions first, then existing rows)
///   2. Apply explicit resolutions by occurrence_id to already-matched entries
///   3. Collect unmatched entries into ordered queues
///   4. Assign remaining occurrences by document order (explicit first, existing second)
fn assign_occurrences_for_title(
    occurrences: &[WikiLinkOccurrence],
    occurrence_indices: &[usize],
    existing_for_title: Vec<ExistingOccurrence>,
    explicit_for_title: Vec<PendingExplicitResolution>,
    assignments: &mut [Option<OccurrenceAssignment>],
) {
    let occurrence_locations: HashSet<usize> = occurrence_indices
        .iter()
        .map(|index| occurrences[*index].start)
        .collect();

    let existing_count = existing_for_title.len();
    let current_count = occurrence_indices.len();
    let allow_exact_existing_location_match = existing_count == 1 && current_count == 1;
    let allow_existing_reuse_by_order = existing_count == current_count;

    let existing_occurrence_ids: HashSet<String> = existing_for_title
        .iter()
        .map(|e| e.occurrence_id.clone())
        .collect();

    // Partition existing rows into location-matched vs. remaining.
    let (exact_existing_by_location, non_exact_existing) = partition_existing_by_location(
        existing_for_title,
        &occurrence_locations,
        allow_exact_existing_location_match,
    );

    // Partition explicit resolutions into location-matched, id-matched, and remaining.
    let (explicit_by_occurrence_id, exact_explicit_by_location, non_exact_explicit) =
        partition_explicit(
            explicit_for_title,
            &existing_occurrence_ids,
            &occurrence_locations,
        );

    // Mutable copies for consumption during matching.
    let mut exact_existing_by_location = exact_existing_by_location;
    let mut exact_explicit_by_location = exact_explicit_by_location;
    let mut explicit_by_occurrence_id = explicit_by_occurrence_id;

    // --- Pass 1: Match by exact location ---
    for occurrence_index in occurrence_indices {
        let occurrence = &occurrences[*occurrence_index];

        // Prefer an explicit resolution at this location.
        if let Some(explicit) = exact_explicit_by_location.remove(&occurrence.start) {
            let occurrence_id = explicit.occurrence_id.clone().unwrap_or_else(|| {
                exact_existing_by_location
                    .remove(&occurrence.start)
                    .map(|e| e.occurrence_id)
                    .unwrap_or_else(generate_wikilink_occurrence_id)
            });
            assignments[*occurrence_index] = Some(OccurrenceAssignment {
                occurrence_id,
                preserved_target: Some(explicit.target_note_id.clone()),
                explicit_target: Some(explicit.target_note_id),
                is_explicit: true,
            });
            continue;
        }

        // Fall back to an existing row at this location.
        if let Some(existing) = exact_existing_by_location.remove(&occurrence.start) {
            assignments[*occurrence_index] = Some(OccurrenceAssignment {
                occurrence_id: existing.occurrence_id,
                preserved_target: existing.target_note_id,
                explicit_target: None,
                is_explicit: existing.is_explicit,
            });
        }
    }

    // --- Pass 2: Apply explicit resolutions by occurrence_id ---
    for occurrence_index in occurrence_indices {
        let Some(assignment) = assignments[*occurrence_index].as_mut() else {
            continue;
        };

        if let Some(explicit) = explicit_by_occurrence_id.remove(&assignment.occurrence_id) {
            assignment.explicit_target = Some(explicit.target_note_id);
            assignment.is_explicit = true;
        }
    }

    // --- Pass 3: Build ordered queues from unmatched entries ---
    let mut remaining_existing = if allow_existing_reuse_by_order {
        let mut queue: Vec<ExistingOccurrence> = non_exact_existing;
        queue.extend(exact_existing_by_location.into_values());
        queue.sort_by(|left, right| {
            left.location
                .cmp(&right.location)
                .then_with(|| left.occurrence_id.cmp(&right.occurrence_id))
        });
        VecDeque::from(queue)
    } else {
        VecDeque::new()
    };

    let mut remaining_explicit = {
        let mut queue: Vec<PendingExplicitResolution> = non_exact_explicit;
        queue.extend(exact_explicit_by_location.into_values());
        queue.sort_by(|left, right| {
            left.location
                .cmp(&right.location)
                .then_with(|| left.title.cmp(&right.title))
                .then_with(|| left.occurrence_id.cmp(&right.occurrence_id))
        });
        VecDeque::from(queue)
    };

    // --- Pass 4: Assign remaining by document order ---
    for occurrence_index in occurrence_indices {
        if assignments[*occurrence_index].is_some() {
            continue;
        }

        if let Some(explicit) = remaining_explicit.pop_front() {
            let occurrence_id = explicit
                .occurrence_id
                .unwrap_or_else(generate_wikilink_occurrence_id);
            assignments[*occurrence_index] = Some(OccurrenceAssignment {
                occurrence_id,
                preserved_target: Some(explicit.target_note_id.clone()),
                explicit_target: Some(explicit.target_note_id),
                is_explicit: true,
            });
            continue;
        }

        if let Some(existing) = remaining_existing.pop_front() {
            assignments[*occurrence_index] = Some(OccurrenceAssignment {
                occurrence_id: existing.occurrence_id,
                preserved_target: existing.target_note_id,
                explicit_target: None,
                is_explicit: existing.is_explicit,
            });
        }
    }
}

// ---------------------------------------------------------------------------
// Partition helpers
// ---------------------------------------------------------------------------

/// Split existing DB rows into those at a current occurrence location vs. the rest.
fn partition_existing_by_location(
    rows: Vec<ExistingOccurrence>,
    occurrence_locations: &HashSet<usize>,
    allow_location_match: bool,
) -> (HashMap<usize, ExistingOccurrence>, Vec<ExistingOccurrence>) {
    let mut by_location = HashMap::new();
    let mut remaining = Vec::new();
    for existing in rows {
        if allow_location_match && occurrence_locations.contains(&existing.location) {
            by_location.insert(existing.location, existing);
        } else {
            remaining.push(existing);
        }
    }
    (by_location, remaining)
}

/// Split explicit resolutions into three buckets:
///   1. Matched by occurrence_id to an existing row
///   2. Matched by exact location to a current occurrence
///   3. Remaining (unmatched)
fn partition_explicit(
    resolutions: Vec<PendingExplicitResolution>,
    existing_occurrence_ids: &HashSet<String>,
    occurrence_locations: &HashSet<usize>,
) -> (
    HashMap<String, PendingExplicitResolution>,
    HashMap<usize, PendingExplicitResolution>,
    Vec<PendingExplicitResolution>,
) {
    let mut by_occurrence_id = HashMap::new();
    let mut by_location = HashMap::new();
    let mut remaining = Vec::new();
    for explicit in resolutions {
        if let Some(occurrence_id) = explicit.occurrence_id.clone() {
            if existing_occurrence_ids.contains(&occurrence_id) {
                by_occurrence_id.insert(occurrence_id, explicit);
            } else if occurrence_locations.contains(&explicit.location)
                && !by_location.contains_key(&explicit.location)
            {
                by_location.insert(explicit.location, explicit);
            } else {
                remaining.push(explicit);
            }
        } else if occurrence_locations.contains(&explicit.location)
            && !by_location.contains_key(&explicit.location)
        {
            by_location.insert(explicit.location, explicit);
        } else {
            remaining.push(explicit);
        }
    }
    (by_occurrence_id, by_location, remaining)
}

// ---------------------------------------------------------------------------
// Final resolution and DB insert
// ---------------------------------------------------------------------------

fn insert_index_rows(
    conn: &Connection,
    note_id: &str,
    occurrences: &[WikiLinkOccurrence],
    assignments: Vec<Option<OccurrenceAssignment>>,
    resolution_map: &HashMap<String, TitleResolution>,
) -> Result<(), rusqlite::Error> {
    for (index, occurrence) in occurrences.iter().enumerate() {
        let assignment = assignments[index]
            .clone()
            .unwrap_or_else(|| OccurrenceAssignment {
                occurrence_id: generate_wikilink_occurrence_id(),
                preserved_target: None,
                explicit_target: None,
                is_explicit: false,
            });

        let target_note_id = if assignment.is_explicit {
            assignment
                .explicit_target
                .clone()
                .or(assignment.preserved_target.clone())
        } else {
            resolution_map
                .get(&occurrence.normalized_title)
                .map(|r| r.preferred_note_id.clone())
        };

        log::info!(
            "[wikilinks] indexed occurrence note_id={} occurrence_id={} location={} title={} normalized_title={} explicit_target={:?} preserved_target={:?} is_explicit={} resolved_target={:?}",
            note_id,
            assignment.occurrence_id,
            occurrence.start,
            occurrence.title,
            occurrence.normalized_title,
            assignment.explicit_target,
            assignment.preserved_target,
            assignment.is_explicit,
            target_note_id
        );

        conn.execute(
            "INSERT INTO note_wikilinks (
               source_note_id,
               occurrence_id,
               location,
               title,
               normalized_title,
               target_note_id,
               is_explicit
             )
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                note_id,
                assignment.occurrence_id,
                occurrence.start as i64,
                occurrence.title,
                occurrence.normalized_title,
                target_note_id,
                if assignment.is_explicit { 1 } else { 0 },
            ],
        )?;
    }

    Ok(())
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

fn clear_wikilink_index(conn: &Connection) -> Result<(), rusqlite::Error> {
    conn.execute("DELETE FROM note_wikilinks", [])?;
    Ok(())
}

fn active_note_title_resolution_map(
    conn: &Connection,
) -> Result<HashMap<String, TitleResolution>, rusqlite::Error> {
    let mut statement = conn.prepare(
        "SELECT id, title
         FROM notes
         WHERE deleted_at IS NULL
         ORDER BY COALESCE(edited_at, modified_at, created_at) DESC,
                  created_at DESC,
                  id DESC",
    )?;
    let rows = statement.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })?;

    let mut resolution_map = HashMap::new();
    for row in rows {
        let (note_id, title) = row?;
        let Some(normalized_title) = normalize_wikilink_title(&title) else {
            continue;
        };

        resolution_map
            .entry(normalized_title)
            .and_modify(|resolution: &mut TitleResolution| {
                resolution.match_count += 1;
            })
            .or_insert_with(|| TitleResolution {
                preferred_note_id: note_id,
                match_count: 1,
            });
    }

    Ok(resolution_map)
}

fn active_note_ids_by_normalized_title(
    conn: &Connection,
) -> Result<HashMap<String, HashSet<String>>, rusqlite::Error> {
    let mut statement = conn.prepare(
        "SELECT id, title
         FROM notes
         WHERE deleted_at IS NULL",
    )?;
    let rows = statement.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })?;

    let mut note_ids_by_title = HashMap::<String, HashSet<String>>::new();
    for row in rows {
        let (note_id, title) = row?;
        let Some(normalized_title) = normalize_wikilink_title(&title) else {
            continue;
        };
        note_ids_by_title
            .entry(normalized_title)
            .or_default()
            .insert(note_id);
    }

    Ok(note_ids_by_title)
}

fn app_setting(conn: &Connection, key: &str) -> Result<Option<String>, rusqlite::Error> {
    conn.query_row(
        "SELECT value FROM app_settings WHERE key = ?1",
        params![key],
        |row| row.get(0),
    )
    .optional()
}

fn set_app_setting(conn: &Connection, key: &str, value: &str) -> Result<(), rusqlite::Error> {
    conn.execute(
        "INSERT INTO app_settings (key, value)
         VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::adapters::sqlite::migrations::account_migrations;

    #[test]
    fn rebuild_wikilink_index_populates_rows_and_targets() {
        let mut conn = Connection::open_in_memory().unwrap();
        account_migrations().to_latest(&mut conn).unwrap();

        conn.execute(
                "INSERT INTO notes (id, title, markdown, created_at, modified_at, edited_at, locally_modified)
             VALUES
               ('note-1', 'Source', '# Source\n\n[[Target]] [[Target]]', 1, 1, 1, 1),
               ('note-2', 'Target', '# Target', 1, 1, 1, 1)",
            [],
        )
        .unwrap();

        ensure_wikilink_index_ready(&mut conn).unwrap();

        let rows: Vec<(String, i64)> = {
            let mut statement = conn
                .prepare(
                    "SELECT target_note_id, location
                     FROM note_wikilinks
                     WHERE source_note_id = 'note-1'
                     ORDER BY location ASC",
                )
                .unwrap();
            statement
                .query_map([], |row| {
                    Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
                })
                .unwrap()
                .collect::<Result<Vec<_>, _>>()
                .unwrap()
        };

        assert_eq!(
            rows,
            vec![("note-2".to_string(), 10), ("note-2".to_string(), 21),]
        );
    }

    #[test]
    fn refresh_wikilink_targets_resolves_existing_dangling_rows() {
        let mut conn = Connection::open_in_memory().unwrap();
        account_migrations().to_latest(&mut conn).unwrap();

        conn.execute(
            "INSERT INTO notes (id, title, markdown, created_at, modified_at, edited_at, locally_modified)
             VALUES ('note-1', 'Source', '# Source\n\n[[Target]]', 1, 1, 1, 1)",
            [],
        )
        .unwrap();

        ensure_wikilink_index_ready(&mut conn).unwrap();

        let unresolved: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM note_wikilinks WHERE target_note_id IS NULL",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(unresolved, 1);

        conn.execute(
            "INSERT INTO notes (id, title, markdown, created_at, modified_at, edited_at, locally_modified)
             VALUES ('note-2', 'Target', '# Target', 1, 1, 1, 1)",
            [],
        )
        .unwrap();

        refresh_wikilink_targets(&conn, &["Target".to_string()]).unwrap();

        let target_note_id: String = conn
            .query_row(
                "SELECT target_note_id FROM note_wikilinks WHERE source_note_id = 'note-1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(target_note_id, "note-2");
    }

    #[test]
    fn refresh_wikilink_targets_clears_stale_targets_after_rename() {
        let mut conn = Connection::open_in_memory().unwrap();
        account_migrations().to_latest(&mut conn).unwrap();

        conn.execute(
            "INSERT INTO notes (id, title, markdown, created_at, modified_at, edited_at, locally_modified)
             VALUES
               ('source', 'Source', '# Source\n\n[[Target]]', 1, 1, 1, 1),
               ('target', 'Target', '# Target', 1, 1, 1, 1)",
            [],
        )
        .unwrap();

        rebuild_note_wikilink_index(&conn, "source", "# Source\n\n[[Target]]", &[]).unwrap();

        let initial_target: String = conn
            .query_row(
                "SELECT target_note_id FROM note_wikilinks WHERE source_note_id = 'source'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(initial_target, "target");

        conn.execute(
            "UPDATE notes SET title = 'Renamed', markdown = '# Renamed' WHERE id = 'target'",
            [],
        )
        .unwrap();

        refresh_wikilink_targets(&conn, &["Target".to_string(), "Renamed".to_string()]).unwrap();

        let cleared_target: Option<String> = conn
            .query_row(
                "SELECT target_note_id FROM note_wikilinks WHERE source_note_id = 'source'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(cleared_target, None);
    }

    #[test]
    fn refresh_wikilink_targets_does_not_reassign_broken_explicit_targets() {
        let mut conn = Connection::open_in_memory().unwrap();
        account_migrations().to_latest(&mut conn).unwrap();

        conn.execute(
            "INSERT INTO notes (id, title, markdown, created_at, modified_at, edited_at, locally_modified)
             VALUES
               ('source', 'Source', '# Source\n\n[[Target]]', 1, 1, 1, 1),
               ('target-a', 'Target', '# Target', 1, 1, 1, 1),
               ('target-b', 'Target', '# Target', 2, 2, 2, 1)",
            [],
        )
        .unwrap();

        rebuild_note_wikilink_index(
            &conn,
            "source",
            "# Source\n\n[[Target]]",
            &[WikiLinkResolutionInput {
                occurrence_id: Some("EXPLICIT1".to_string()),
                is_explicit: true,
                location: 10,
                title: "Target".to_string(),
                target_note_id: "target-a".to_string(),
            }],
        )
        .unwrap();

        conn.execute(
            "UPDATE notes
             SET title = 'Renamed', markdown = '# Renamed'
             WHERE id = 'target-a'",
            [],
        )
        .unwrap();

        refresh_wikilink_targets(&conn, &["Target".to_string(), "Renamed".to_string()]).unwrap();

        let stored: (Option<String>, bool) = conn
            .query_row(
                "SELECT target_note_id, is_explicit
                 FROM note_wikilinks
                 WHERE source_note_id = 'source'",
                [],
                |row| Ok((row.get(0)?, row.get::<_, i64>(1)? != 0)),
            )
            .unwrap();

        assert_eq!(stored.0.as_deref(), Some("target-a"));
        assert!(stored.1);
    }

    #[test]
    fn rebuild_wikilink_index_prefers_explicit_resolution_for_duplicate_titles() {
        let mut conn = Connection::open_in_memory().unwrap();
        account_migrations().to_latest(&mut conn).unwrap();

        conn.execute(
            "INSERT INTO notes (id, title, markdown, created_at, modified_at, edited_at, locally_modified)
             VALUES
               ('source', 'Source', '# Source\n\n[[asdf]]', 1, 1, 1, 1),
               ('target-1', 'asdf', '# asdf', 1, 1, 1, 1),
               ('target-2', 'asdf', '# asdf', 1, 1, 1, 1)",
            [],
        )
        .unwrap();

        rebuild_note_wikilink_index(
            &conn,
            "source",
            "# Source\n\n[[asdf]]",
            &[WikiLinkResolutionInput {
                occurrence_id: Some("CLIENT1".to_string()),
                is_explicit: true,
                location: 10,
                title: "asdf".to_string(),
                target_note_id: "target-2".to_string(),
            }],
        )
        .unwrap();

        let target_note_id: String = conn
            .query_row(
                "SELECT target_note_id FROM note_wikilinks WHERE source_note_id = 'source'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(target_note_id, "target-2");
    }

    #[test]
    fn rebuild_wikilink_index_matches_explicit_resolution_by_occurrence_id() {
        let mut conn = Connection::open_in_memory().unwrap();
        account_migrations().to_latest(&mut conn).unwrap();

        conn.execute(
            "INSERT INTO notes (id, title, markdown, created_at, modified_at, edited_at, locally_modified)
             VALUES
               ('source', 'Source', '# Source\n\n[[asdf]] [[asdf]]', 1, 1, 1, 1),
               ('target-1', 'asdf', '# asdf', 1, 1, 1, 1),
               ('target-2', 'asdf', '# asdf', 1, 1, 1, 1)",
            [],
        )
        .unwrap();

        rebuild_note_wikilink_index(&conn, "source", "# Source\n\n[[asdf]] [[asdf]]", &[]).unwrap();

        let second_occurrence_id: String = conn
            .query_row(
                "SELECT occurrence_id
                 FROM note_wikilinks
                 WHERE source_note_id = 'source'
                 ORDER BY location ASC
                 LIMIT 1 OFFSET 1",
                [],
                |row| row.get(0),
            )
            .unwrap();

        rebuild_note_wikilink_index(
            &conn,
            "source",
            "# Source\n\n[[asdf]] x [[asdf]]",
            &[WikiLinkResolutionInput {
                occurrence_id: Some(second_occurrence_id.clone()),
                is_explicit: true,
                location: 19,
                title: "asdf".to_string(),
                target_note_id: "target-2".to_string(),
            }],
        )
        .unwrap();

        let rows: Vec<(String, i64, Option<String>)> = {
            let mut statement = conn
                .prepare(
                    "SELECT occurrence_id, location, target_note_id
                     FROM note_wikilinks
                     WHERE source_note_id = 'source'
                     ORDER BY location ASC",
                )
                .unwrap();
            statement
                .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))
                .unwrap()
                .collect::<Result<Vec<_>, _>>()
                .unwrap()
        };

        assert_eq!(rows.len(), 2);
        assert_eq!(rows[1].0, second_occurrence_id);
        assert_eq!(rows[1].1, 21);
        assert_eq!(rows[1].2.as_deref(), Some("target-2"));
    }

    #[test]
    fn rebuild_wikilink_index_does_not_reuse_duplicate_existing_rows_when_count_changes() {
        let mut conn = Connection::open_in_memory().unwrap();
        account_migrations().to_latest(&mut conn).unwrap();

        conn.execute(
            "INSERT INTO notes (id, title, markdown, created_at, modified_at, edited_at, locally_modified)
             VALUES
               ('source', 'Source', '# Source\n\n[[asdf]] [[asdf]]', 1, 1, 1, 1),
               ('target-1', 'asdf', '# asdf', 1, 1, 1, 1),
               ('target-2', 'asdf', '# asdf', 1, 1, 1, 1)",
            [],
        )
        .unwrap();

        rebuild_note_wikilink_index(
            &conn,
            "source",
            "# Source\n\n[[asdf]] [[asdf]]",
            &[
                WikiLinkResolutionInput {
                    occurrence_id: Some("FIRST".to_string()),
                    is_explicit: true,
                    location: 10,
                    title: "asdf".to_string(),
                    target_note_id: "target-1".to_string(),
                },
                WikiLinkResolutionInput {
                    occurrence_id: Some("SECOND".to_string()),
                    is_explicit: true,
                    location: 19,
                    title: "asdf".to_string(),
                    target_note_id: "target-2".to_string(),
                },
            ],
        )
        .unwrap();

        let original_occurrence_ids = {
            let mut statement = conn
                .prepare(
                    "SELECT occurrence_id
                     FROM note_wikilinks
                     WHERE source_note_id = 'source'
                     ORDER BY location ASC",
                )
                .unwrap();
            statement
                .query_map([], |row| row.get::<_, String>(0))
                .unwrap()
                .collect::<Result<Vec<_>, _>>()
                .unwrap()
        };
        assert_eq!(original_occurrence_ids, vec!["FIRST", "SECOND"]);

        rebuild_note_wikilink_index(
            &conn,
            "source",
            "# Source\n\n[[asdf]] [[asdf]] [[asdf]]",
            &[],
        )
        .unwrap();

        let rows = {
            let mut statement = conn
                .prepare(
                    "SELECT occurrence_id, location
                     FROM note_wikilinks
                     WHERE source_note_id = 'source'
                     ORDER BY location ASC",
                )
                .unwrap();
            statement
                .query_map([], |row| {
                    Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
                })
                .unwrap()
                .collect::<Result<Vec<_>, _>>()
                .unwrap()
        };

        assert_eq!(rows.len(), 3);
        assert!(!rows
            .iter()
            .any(|(occurrence_id, _)| occurrence_id == "FIRST"));
        assert!(!rows
            .iter()
            .any(|(occurrence_id, _)| occurrence_id == "SECOND"));
    }

    #[test]
    fn rebuild_wikilink_index_preserves_occurrence_id_when_location_shifts() {
        let mut conn = Connection::open_in_memory().unwrap();
        account_migrations().to_latest(&mut conn).unwrap();

        conn.execute(
            "INSERT INTO notes (id, title, markdown, created_at, modified_at, edited_at, locally_modified)
             VALUES
               ('source', 'Source', '# Source\n\n[[Target]]', 1, 1, 1, 1),
               ('target', 'Target', '# Target', 1, 1, 1, 1)",
            [],
        )
        .unwrap();

        rebuild_note_wikilink_index(&conn, "source", "# Source\n\n[[Target]]", &[]).unwrap();

        let original_occurrence_id: String = conn
            .query_row(
                "SELECT occurrence_id
                 FROM note_wikilinks
                 WHERE source_note_id = 'source'",
                [],
                |row| row.get(0),
            )
            .unwrap();

        rebuild_note_wikilink_index(&conn, "source", "# Source\n\nIntro\n\n[[Target]]", &[])
            .unwrap();

        let shifted: (String, i64, String) = conn
            .query_row(
                "SELECT occurrence_id, location, target_note_id
                 FROM note_wikilinks
                 WHERE source_note_id = 'source'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap();

        assert_eq!(shifted.0, original_occurrence_id);
        assert_eq!(shifted.1, 17);
        assert_eq!(shifted.2, "target");
    }
}

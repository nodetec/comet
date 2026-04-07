use std::collections::{BTreeSet, HashMap, HashSet, VecDeque};
use std::time::Instant;

use rusqlite::{params, Connection, OptionalExtension};
use uuid::Uuid;

use crate::domain::common::text::{extract_wikilink_occurrences, normalize_wikilink_title};
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

fn generate_wikilink_occurrence_id() -> String {
    Uuid::new_v4().simple().to_string().to_uppercase()
}

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

fn clear_wikilink_index(conn: &Connection) -> Result<(), rusqlite::Error> {
    conn.execute("DELETE FROM note_wikilinks", [])?;
    Ok(())
}

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

    let existing_rows = {
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
        rows.collect::<Result<Vec<_>, _>>()?
    };

    conn.execute(
        "DELETE FROM note_wikilinks WHERE source_note_id = ?1",
        params![note_id],
    )?;

    let mut occurrence_indices_by_title = HashMap::<String, Vec<usize>>::new();
    for (index, occurrence) in occurrences.iter().enumerate() {
        occurrence_indices_by_title
            .entry(occurrence.normalized_title.clone())
            .or_default()
            .push(index);
    }

    let mut existing_by_title = HashMap::<String, Vec<ExistingOccurrence>>::new();
    for existing in existing_rows {
        existing_by_title
            .entry(existing.normalized_title.clone())
            .or_default()
            .push(existing);
    }
    for existing_group in existing_by_title.values_mut() {
        existing_group.sort_by(|left, right| {
            left.location
                .cmp(&right.location)
                .then_with(|| left.occurrence_id.cmp(&right.occurrence_id))
                .then_with(|| left.title.cmp(&right.title))
        });
    }

    let mut explicit_by_title = HashMap::<String, Vec<PendingExplicitResolution>>::new();
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
        explicit_by_title
            .entry(normalized_title.clone())
            .or_default()
            .push(PendingExplicitResolution {
                occurrence_id: resolution.occurrence_id.clone(),
                location: resolution.location,
                title: resolution.title.clone(),
                target_note_id: resolution.target_note_id.clone(),
            });
    }
    for explicit_group in explicit_by_title.values_mut() {
        explicit_group.sort_by(|left, right| {
            left.location
                .cmp(&right.location)
                .then_with(|| left.title.cmp(&right.title))
                .then_with(|| left.occurrence_id.cmp(&right.occurrence_id))
        });
    }

    let mut inserted_rows = Vec::with_capacity(occurrences.len());
    let mut assignments =
        vec![None::<(String, Option<String>, Option<String>, bool)>; occurrences.len()];

    for (normalized_title, occurrence_indices) in &occurrence_indices_by_title {
        let occurrence_locations = occurrence_indices
            .iter()
            .map(|index| occurrences[*index].start)
            .collect::<HashSet<_>>();

        let existing_for_title = existing_by_title
            .remove(normalized_title)
            .unwrap_or_default();
        let existing_count = existing_for_title.len();
        let current_count = occurrence_indices.len();
        let allow_exact_existing_location_match = existing_count == 1 && current_count == 1;
        let allow_existing_reuse_by_order = existing_count == current_count;
        let existing_occurrence_ids = existing_for_title
            .iter()
            .map(|existing| existing.occurrence_id.clone())
            .collect::<HashSet<_>>();

        let mut exact_existing_by_location = HashMap::<usize, ExistingOccurrence>::new();
        let mut non_exact_existing = Vec::new();
        for existing in existing_for_title {
            if occurrence_locations.contains(&existing.location) {
                if allow_exact_existing_location_match {
                    exact_existing_by_location.insert(existing.location, existing);
                } else {
                    non_exact_existing.push(existing);
                }
            } else {
                non_exact_existing.push(existing);
            }
        }

        let mut explicit_by_occurrence_id = HashMap::<String, PendingExplicitResolution>::new();
        let mut exact_explicit_by_location = HashMap::<usize, PendingExplicitResolution>::new();
        let mut non_exact_explicit = Vec::new();
        for explicit in explicit_by_title
            .remove(normalized_title)
            .unwrap_or_default()
        {
            if let Some(occurrence_id) = explicit.occurrence_id.clone() {
                if existing_occurrence_ids.contains(&occurrence_id) {
                    explicit_by_occurrence_id.insert(occurrence_id, explicit);
                } else if occurrence_locations.contains(&explicit.location)
                    && !exact_explicit_by_location.contains_key(&explicit.location)
                {
                    exact_explicit_by_location.insert(explicit.location, explicit);
                } else {
                    non_exact_explicit.push(explicit);
                }
            } else if occurrence_locations.contains(&explicit.location)
                && !exact_explicit_by_location.contains_key(&explicit.location)
            {
                exact_explicit_by_location.insert(explicit.location, explicit);
            } else {
                non_exact_explicit.push(explicit);
            }
        }

        for occurrence_index in occurrence_indices {
            let occurrence = &occurrences[*occurrence_index];

            if let Some(explicit) = exact_explicit_by_location.remove(&occurrence.start) {
                let occurrence_id = explicit.occurrence_id.clone().unwrap_or_else(|| {
                    exact_existing_by_location
                        .remove(&occurrence.start)
                        .map(|existing| existing.occurrence_id)
                        .unwrap_or_else(generate_wikilink_occurrence_id)
                });
                assignments[*occurrence_index] = Some((
                    occurrence_id,
                    Some(explicit.target_note_id.clone()),
                    Some(explicit.target_note_id),
                    true,
                ));
                continue;
            }

            if let Some(existing) = exact_existing_by_location.remove(&occurrence.start) {
                assignments[*occurrence_index] = Some((
                    existing.occurrence_id,
                    existing.target_note_id.clone(),
                    None,
                    existing.is_explicit,
                ));
            }
        }

        for occurrence_index in occurrence_indices {
            let Some((occurrence_id, _preserved_target, explicit_target, is_explicit)) =
                assignments[*occurrence_index].as_mut()
            else {
                continue;
            };

            if let Some(explicit) = explicit_by_occurrence_id.remove(occurrence_id) {
                *explicit_target = Some(explicit.target_note_id);
                *is_explicit = true;
            }
        }

        let mut remaining_existing = if allow_existing_reuse_by_order {
            non_exact_existing.extend(exact_existing_by_location.into_values());
            non_exact_existing.sort_by(|left, right| {
                left.location
                    .cmp(&right.location)
                    .then_with(|| left.occurrence_id.cmp(&right.occurrence_id))
            });
            VecDeque::from(non_exact_existing)
        } else {
            VecDeque::new()
        };
        let mut remaining_explicit = {
            non_exact_explicit.extend(exact_explicit_by_location.into_values());
            non_exact_explicit.sort_by(|left, right| {
                left.location
                    .cmp(&right.location)
                    .then_with(|| left.title.cmp(&right.title))
                    .then_with(|| left.occurrence_id.cmp(&right.occurrence_id))
            });
            VecDeque::from(non_exact_explicit)
        };

        for occurrence_index in occurrence_indices {
            if assignments[*occurrence_index].is_some() {
                continue;
            }

            if let Some(explicit) = remaining_explicit.pop_front() {
                let occurrence_id = explicit
                    .occurrence_id
                    .unwrap_or_else(generate_wikilink_occurrence_id);
                assignments[*occurrence_index] = Some((
                    occurrence_id,
                    Some(explicit.target_note_id.clone()),
                    Some(explicit.target_note_id),
                    true,
                ));
                continue;
            }

            if let Some(existing) = remaining_existing.pop_front() {
                assignments[*occurrence_index] = Some((
                    existing.occurrence_id,
                    existing.target_note_id.clone(),
                    None,
                    existing.is_explicit,
                ));
            }
        }
    }

    for (index, occurrence) in occurrences.iter().enumerate() {
        let (occurrence_id, preserved_target, explicit_target, is_explicit) = assignments[index]
            .clone()
            .unwrap_or_else(|| (generate_wikilink_occurrence_id(), None, None, false));
        let target_note_id = if is_explicit {
            explicit_target.clone().or(preserved_target.clone())
        } else {
            resolution_map
                .get(&occurrence.normalized_title)
                .map(|resolution| resolution.preferred_note_id.clone())
        };
        log::info!(
            "[wikilinks] indexed occurrence note_id={} occurrence_id={} location={} title={} normalized_title={} explicit_target={:?} preserved_target={:?} is_explicit={} resolved_target={:?}",
            note_id,
            occurrence_id,
            occurrence.start,
            occurrence.title,
            occurrence.normalized_title,
            explicit_target,
            preserved_target,
            is_explicit,
            target_note_id
        );
        inserted_rows.push((
            occurrence_id,
            occurrence.start as i64,
            occurrence.title.clone(),
            occurrence.normalized_title.clone(),
            target_note_id,
            is_explicit,
        ));
    }

    for (occurrence_id, location, title, normalized_title, target_note_id, is_explicit) in
        inserted_rows
    {
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
                occurrence_id,
                location,
                title,
                normalized_title,
                target_note_id,
                if is_explicit { 1 } else { 0 },
            ],
        )?;
    }

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

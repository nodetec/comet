use crate::adapters::nostr::snapshot_bootstrap::bootstrap_relay_connection;
use crate::adapters::nostr::snapshot_push::{
    push_deletion_snapshot, push_note_snapshots_batch, retry_pending_blob_uploads,
};
use crate::adapters::sqlite::sync_settings_repository::{
    ordered_available_sync_relay_urls, save_active_sync_relay_url,
};
use crate::domain::sync::model::{SyncChangePayload, SyncCommand, SyncState};
use crate::error::AppError;
use nostr_sdk::prelude::Keys;
use rusqlite::{Connection, OptionalExtension};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tokio::sync::{mpsc, watch, Mutex};

use super::sync_manager::{set_state, sync_log};

const BLOB_RETRY_INTERVAL: Duration = Duration::from_secs(30);
const RELAY_INACTIVITY_TIMEOUT: Duration = Duration::from_secs(60);
const PING_INTERVAL: Duration = Duration::from_secs(30);

pub(super) async fn run_snapshot_sync_connection(
    app: &AppHandle,
    state: &Arc<Mutex<SyncState>>,
    shutdown_rx: &mut watch::Receiver<bool>,
    push_rx: &mut mpsc::Receiver<SyncCommand>,
) -> Result<(), AppError> {
    let configured_relay_urls = {
        let conn = crate::db::database_connection(app)?;
        ordered_available_sync_relay_urls(&conn)
    };
    if configured_relay_urls.is_empty() {
        return Err(AppError::custom("No sync relay configured"));
    }

    let keys = {
        let conn = crate::db::database_connection(app)?;
        let (keys, _) = crate::adapters::tauri::key_store::keys_for_current_identity(app, &conn)?;
        keys
    };

    set_state(state, SyncState::Connecting, app).await;

    let mut active_bootstrap = None;
    let mut bootstrap_errors = Vec::new();

    for relay_url in &configured_relay_urls {
        match bootstrap_relay_connection(app, relay_url).await {
            Ok(bootstrap) => {
                if active_bootstrap.is_none() {
                    active_bootstrap = Some((relay_url.clone(), bootstrap));
                }
            }
            Err(error) => {
                sync_log(
                    app,
                    &format!("snapshot bootstrap relay error relay={relay_url}: {error}"),
                );
                bootstrap_errors.push(format!("{relay_url}: {error}"));
            }
        }
    }

    let (relay_url, bootstrap) = active_bootstrap.ok_or_else(|| {
        AppError::custom(format!(
            "Failed to bootstrap any configured sync relay: {}",
            bootstrap_errors.join("; ")
        ))
    })?;

    {
        let conn = crate::db::database_connection(app)?;
        save_active_sync_relay_url(&conn, &relay_url);
    }

    let author_pubkey = bootstrap.author_pubkey.clone();
    // `snapshot_seq` is the bootstrap handoff boundary returned by
    // `CHANGES STATUS`. The live `CHANGES` subscription starts from that
    // boundary, while `checkpoint_seq` later advances as events are applied.
    let snapshot_seq = bootstrap.snapshot_seq;
    let mut connection = bootstrap.connection;
    let backup_relay_urls = configured_relay_urls
        .into_iter()
        .filter(|configured| configured != &relay_url)
        .collect::<Vec<_>>();

    set_state(state, SyncState::Syncing, app).await;
    connection
        .send_changes("sync", &author_pubkey, snapshot_seq, true)
        .await?;

    retry_pending_blob_uploads(app, &keys).await?;
    flush_pending_local_changes(app, &relay_url, &backup_relay_urls, &keys).await?;
    // Bootstrap and any initial local replay are complete at this point. Keep
    // the UI in a steady connected state while the live CHANGES stream stays
    // open rather than pulsing indefinitely until the relay sends EOSE.
    set_state(state, SyncState::Connected, app).await;

    let mut pending_pushes: HashMap<String, tokio::time::Instant> = HashMap::new();
    let debounce_duration = Duration::from_secs(2);
    let mut next_blob_retry_at = tokio::time::Instant::now() + BLOB_RETRY_INTERVAL;
    let mut connected = true;
    let mut ping_interval = tokio::time::interval(PING_INTERVAL);
    ping_interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);

    loop {
        let next_note_wake = pending_pushes.values().min().copied();
        let next_wake = next_note_wake
            .map(|deadline| deadline.min(next_blob_retry_at))
            .unwrap_or(next_blob_retry_at);
        let wake_sleep = tokio::time::sleep_until(next_wake);
        tokio::pin!(wake_sleep);
        tokio::select! {
            () = &mut wake_sleep => {}
            cmd = push_rx.recv() => {
                handle_snapshot_push_command(
                    app,
                    &relay_url,
                    &backup_relay_urls,
                    &keys,
                    cmd,
                    &mut pending_pushes,
                    debounce_duration,
                ).await?;
                continue;
            }
            _ = shutdown_rx.changed() => return Ok(()),
            _ = ping_interval.tick() => {
                if let Err(error) = connection.send_ping().await {
                    sync_log(app, &format!("ping error: {error}"));
                    return Err(error);
                }
                continue;
            }
            incoming = tokio::time::timeout(RELAY_INACTIVITY_TIMEOUT, connection.recv_message()) => {
                match incoming {
                    Ok(result) => {
                        handle_snapshot_incoming_message(app, result?, &keys, &relay_url, state, &mut connected).await?;
                        continue;
                    }
                    Err(_) => {
                        sync_log(
                            app,
                            &format!(
                                "no relay activity for {}s; reconnecting",
                                RELAY_INACTIVITY_TIMEOUT.as_secs()
                            ),
                        );
                        return Err(AppError::custom("Relay read timeout"));
                    }
                }
            }
        }

        let now = tokio::time::Instant::now();
        if now >= next_blob_retry_at {
            if let Err(error) = retry_pending_blob_uploads(app, &keys).await {
                sync_log(app, &format!("snapshot blob retry error: {error}"));
            }
            next_blob_retry_at = now + BLOB_RETRY_INTERVAL;
        }

        let ready: Vec<String> = pending_pushes
            .iter()
            .filter(|(_, deadline)| **deadline <= now)
            .map(|(id, _)| id.clone())
            .collect();

        for id in &ready {
            pending_pushes.remove(id);
        }

        let has_tag_metadata = ready.iter().any(|id| id == "__tag_metadata__");
        let note_ids: Vec<String> = ready
            .into_iter()
            .filter(|id| id != "__tag_metadata__")
            .collect();

        if !note_ids.is_empty() {
            if let Err(error) =
                push_note_snapshots_batch(app, &relay_url, &backup_relay_urls, &keys, &note_ids)
                    .await
            {
                sync_log(app, &format!("snapshot push batch error: {error}"));
            }
        }

        if has_tag_metadata {
            if let Err(error) = crate::adapters::nostr::snapshot_push::push_tag_metadata_snapshot(
                app,
                &relay_url,
                &backup_relay_urls,
                &keys,
            )
            .await
            {
                sync_log(
                    app,
                    &format!("tag metadata snapshot push error: {error}"),
                );
            }
        }
    }
}

fn list_pending_local_sync_commands(conn: &Connection) -> Result<Vec<SyncCommand>, AppError> {
    let mut commands = Vec::new();

    {
        let mut stmt = conn.prepare(
            "SELECT entity_id
             FROM pending_deletions
             ORDER BY created_at ASC, entity_id ASC",
        )?;
        let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
        for row in rows {
            commands.push(SyncCommand::PushDeletion(row?));
        }
    }

    {
        let mut stmt = conn.prepare(
            "SELECT id
             FROM notes
             WHERE locally_modified = 1
             ORDER BY modified_at ASC, id ASC",
        )?;
        let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
        for row in rows {
            commands.push(SyncCommand::PushNote(row?));
        }
    }

    {
        let tag_metadata_modified: Option<String> = conn
            .query_row(
                "SELECT value FROM app_settings WHERE key = 'tag_metadata_locally_modified'",
                [],
                |row| row.get(0),
            )
            .optional()?
            .flatten();
        if tag_metadata_modified.as_deref() == Some("true") {
            commands.push(SyncCommand::PushTagMetadata);
        }
    }

    Ok(commands)
}

async fn flush_pending_local_changes(
    app: &AppHandle,
    active_relay_url: &str,
    backup_relay_urls: &[String],
    keys: &Keys,
) -> Result<(), AppError> {
    let conn = crate::db::database_connection(app)?;
    let pending_commands = list_pending_local_sync_commands(&conn)?;
    drop(conn);

    if pending_commands.is_empty() {
        return Ok(());
    }

    let mut pending_notes = 0usize;
    let mut pending_deletions = 0usize;
    let mut pending_tag_metadata = false;
    for command in &pending_commands {
        match command {
            SyncCommand::PushNote(_) => pending_notes += 1,
            SyncCommand::PushDeletion(_) => pending_deletions += 1,
            SyncCommand::PushTagMetadata => pending_tag_metadata = true,
        }
    }
    sync_log(
        app,
        &format!(
            "replaying pending local changes notes={} deletions={} tag_metadata={}",
            pending_notes, pending_deletions, pending_tag_metadata
        ),
    );

    let mut pending_note_ids = Vec::with_capacity(pending_notes);
    let mut pending_deletion_ids = Vec::with_capacity(pending_deletions);
    for command in pending_commands {
        match command {
            SyncCommand::PushNote(note_id) => pending_note_ids.push(note_id),
            SyncCommand::PushDeletion(entity_id) => pending_deletion_ids.push(entity_id),
            SyncCommand::PushTagMetadata => {}
        }
    }

    for entity_id in pending_deletion_ids {
        if let Err(error) =
            push_deletion_snapshot(app, active_relay_url, backup_relay_urls, keys, &entity_id).await
        {
            sync_log(
                app,
                &format!("snapshot delete push error: {entity_id}: {error}"),
            );
        }
    }

    if let Err(error) = push_note_snapshots_batch(
        app,
        active_relay_url,
        backup_relay_urls,
        keys,
        &pending_note_ids,
    )
    .await
    {
        sync_log(app, &format!("snapshot push batch error: {error}"));
    }

    if pending_tag_metadata {
        if let Err(error) = crate::adapters::nostr::snapshot_push::push_tag_metadata_snapshot(
            app,
            active_relay_url,
            backup_relay_urls,
            keys,
        )
        .await
        {
            sync_log(
                app,
                &format!("tag metadata snapshot push error: {error}"),
            );
        }
    }

    Ok(())
}

async fn handle_snapshot_push_command(
    app: &AppHandle,
    active_relay_url: &str,
    backup_relay_urls: &[String],
    keys: &Keys,
    cmd: Option<SyncCommand>,
    pending_pushes: &mut HashMap<String, tokio::time::Instant>,
    debounce_duration: Duration,
) -> Result<(), AppError> {
    match cmd {
        Some(SyncCommand::PushNote(note_id)) => {
            sync_log(app, &format!("queued snapshot push {note_id}"));
            pending_pushes.insert(note_id, tokio::time::Instant::now() + debounce_duration);
        }
        Some(SyncCommand::PushDeletion(id)) => {
            if let Err(error) =
                push_deletion_snapshot(app, active_relay_url, backup_relay_urls, keys, &id).await
            {
                sync_log(app, &format!("snapshot delete push error: {id}: {error}"));
            }
        }
        Some(SyncCommand::PushTagMetadata) => {
            sync_log(app, "queued tag metadata snapshot push");
            pending_pushes.insert(
                "__tag_metadata__".to_string(),
                tokio::time::Instant::now() + debounce_duration,
            );
        }
        None => return Ok(()),
    }

    Ok(())
}

async fn handle_snapshot_incoming_message(
    app: &AppHandle,
    message: crate::adapters::nostr::relay_client::SnapshotRelayIncomingMessage,
    keys: &Keys,
    relay_url: &str,
    state: &Arc<Mutex<SyncState>>,
    connected: &mut bool,
) -> Result<(), AppError> {
    match message {
        crate::adapters::nostr::relay_client::SnapshotRelayIncomingMessage::ChangesEvent {
            seq,
            event,
            ..
        } => {
            let conn = crate::db::database_connection(app)?;
            match crate::domain::sync::snapshot_apply_service::apply_remote_snapshot_event(
                &conn,
                relay_url,
                keys,
                &event,
                Some(seq),
                |_| {},
            )? {
                crate::domain::sync::snapshot_apply_service::ApplySnapshotResult::NoteChange(
                    change,
                ) => {
                    emit_sync_remote_change(app, change);
                }
                crate::domain::sync::snapshot_apply_service::ApplySnapshotResult::TagMetadataChange => {
                    let _ = app.emit("sync-tag-metadata-change", ());
                }
                crate::domain::sync::snapshot_apply_service::ApplySnapshotResult::NoChange => {}
            }
        }
        crate::adapters::nostr::relay_client::SnapshotRelayIncomingMessage::ChangesEose {
            last_seq,
            ..
        } => {
            let conn = crate::db::database_connection(app)?;
            let relay_state = crate::adapters::sqlite::snapshot_repository::get_sync_relay_state(
                &conn, relay_url,
            )?;
            let min_payload_mtime = relay_state
                .as_ref()
                .and_then(|state| state.min_payload_mtime);
            let snapshot_seq = relay_state.as_ref().and_then(|state| state.snapshot_seq);
            // `last_seq` is the live `CHANGES` progress marker. Preserve the
            // original bootstrap `snapshot_seq` so the handoff boundary remains
            // distinguishable from the live checkpoint.
            crate::adapters::sqlite::snapshot_repository::upsert_sync_relay_state(
                &conn,
                relay_url,
                Some(last_seq),
                snapshot_seq,
                Some(crate::domain::common::time::now_millis()),
                min_payload_mtime,
            )?;
            if !*connected {
                *connected = true;
                set_state(state, SyncState::Connected, app).await;
            }
        }
        crate::adapters::nostr::relay_client::SnapshotRelayIncomingMessage::ChangesErr {
            message,
            ..
        } => {
            return Err(AppError::custom(format!(
                "Snapshot relay CHANGES error: {message}"
            )));
        }
        crate::adapters::nostr::relay_client::SnapshotRelayIncomingMessage::Notice(message) => {
            sync_log(app, &format!("relay notice: {message}"));
        }
        _ => {}
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::adapters::sqlite::migrations::account_migrations;

    #[test]
    fn lists_pending_local_sync_commands_from_all_backlogs() {
        let mut conn = rusqlite::Connection::open_in_memory().unwrap();
        account_migrations().to_latest(&mut conn).unwrap();

        conn.execute(
            "INSERT INTO notes (id, title, markdown, created_at, modified_at, edited_at, locally_modified)
             VALUES ('note-1', 'Title', '# Title', 100, 200, 200, 1)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO pending_deletions (entity_id, created_at)
             VALUES ('note-2', 50)",
            [],
        )
        .unwrap();

        let commands = list_pending_local_sync_commands(&conn).unwrap();
        assert_eq!(commands.len(), 2);
        assert!(matches!(&commands[0], SyncCommand::PushDeletion(id) if id == "note-2"));
        assert!(matches!(&commands[1], SyncCommand::PushNote(id) if id == "note-1"));
    }
}

fn emit_sync_remote_change(app: &AppHandle, payload: SyncChangePayload) {
    let _ = app.emit("sync-remote-change", payload);
}

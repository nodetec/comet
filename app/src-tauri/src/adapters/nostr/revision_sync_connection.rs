use crate::adapters::nostr::revision_bootstrap::{
    bootstrap_relay_connection, RevisionBootstrapResult,
};
use crate::adapters::nostr::revision_push::{
    push_deletion_revision, push_note_revision, push_notebook_revision,
};
use crate::adapters::sqlite::sync_repository::{
    ordered_available_sync_relay_urls, save_active_sync_relay_url,
};
use crate::domain::sync::model::{SyncChangePayload, SyncCommand, SyncState};
use crate::error::AppError;
use nostr_sdk::prelude::Keys;
use rusqlite::Connection;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::{mpsc, watch, Mutex};

use super::sync_manager::{set_state, sync_log};

pub(super) async fn run_revision_sync_connection(
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

    set_state(state, SyncState::Syncing, app).await;

    let mut active_bootstrap = None;
    let mut bootstrap_errors = Vec::new();

    for relay_url in &configured_relay_urls {
        match bootstrap_relay_connection(app, relay_url).await {
            Ok(bootstrap) => {
                log_bootstrap_result(app, relay_url, &bootstrap);
                if active_bootstrap.is_none() {
                    active_bootstrap = Some((relay_url.clone(), bootstrap));
                }
            }
            Err(error) => {
                sync_log(
                    app,
                    &format!("revision bootstrap relay error relay={relay_url}: {error}"),
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

    let recipient = bootstrap.recipient.clone();
    // `snapshot_seq` is the bootstrap handoff boundary returned by Negentropy.
    // The live `CHANGES` subscription starts from that boundary, while
    // `checkpoint_seq` later advances as events are actually applied.
    let snapshot_seq = bootstrap.snapshot_seq;
    let mut connection = bootstrap.connection;
    let backup_relay_urls = configured_relay_urls
        .into_iter()
        .filter(|configured| configured != &relay_url)
        .collect::<Vec<_>>();

    connection
        .send_changes("sync", &recipient, snapshot_seq, true)
        .await?;

    flush_pending_local_changes(
        app,
        &relay_url,
        &backup_relay_urls,
        &keys,
    )
    .await?;

    let mut pending_pushes: HashMap<String, tokio::time::Instant> = HashMap::new();
    let debounce_duration = Duration::from_secs(2);
    let mut connected = false;

    loop {
        let next_wake = pending_pushes.values().min().copied();
        if let Some(next_wake) = next_wake {
            let debounce_sleep = tokio::time::sleep_until(next_wake);
            tokio::pin!(debounce_sleep);
            tokio::select! {
                () = &mut debounce_sleep => {}
                cmd = push_rx.recv() => {
                    handle_revision_push_command(
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
                incoming = connection.recv_message() => {
                    handle_revision_incoming_message(app, incoming?, &keys, &relay_url, state, &mut connected).await?;
                    continue;
                }
            }
        } else {
            tokio::select! {
                cmd = push_rx.recv() => {
                    handle_revision_push_command(
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
                incoming = connection.recv_message() => {
                    handle_revision_incoming_message(app, incoming?, &keys, &relay_url, state, &mut connected).await?;
                    continue;
                }
            }
        }

        let now = tokio::time::Instant::now();
        let ready: Vec<String> = pending_pushes
            .iter()
            .filter(|(_, deadline)| **deadline <= now)
            .map(|(id, _)| id.clone())
            .collect();

        for note_id in &ready {
            pending_pushes.remove(note_id);
            if let Err(error) =
                push_note_revision(app, &relay_url, &backup_relay_urls, &keys, note_id).await
            {
                sync_log(app, &format!("revision push error: {note_id}: {error}"));
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
        let mut stmt = conn.prepare(
            "SELECT id
             FROM notebooks
             WHERE locally_modified = 1
             ORDER BY updated_at ASC, id ASC",
        )?;
        let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
        for row in rows {
            commands.push(SyncCommand::PushNotebook(row?));
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
    let mut pending_notebooks = 0usize;
    let mut pending_deletions = 0usize;
    for command in &pending_commands {
        match command {
            SyncCommand::PushNote(_) => pending_notes += 1,
            SyncCommand::PushNotebook(_) => pending_notebooks += 1,
            SyncCommand::PushDeletion(_) => pending_deletions += 1,
        }
    }
    sync_log(
        app,
        &format!(
            "replaying pending local changes notes={} notebooks={} deletions={}",
            pending_notes, pending_notebooks, pending_deletions
        ),
    );

    for command in pending_commands {
        match command {
            SyncCommand::PushNote(note_id) => {
                if let Err(error) =
                    push_note_revision(app, active_relay_url, backup_relay_urls, keys, &note_id)
                        .await
                {
                    sync_log(app, &format!("revision push error: {note_id}: {error}"));
                }
            }
            SyncCommand::PushNotebook(notebook_id) => {
                if let Err(error) = push_notebook_revision(
                    app,
                    active_relay_url,
                    backup_relay_urls,
                    keys,
                    &notebook_id,
                )
                .await
                {
                    sync_log(
                        app,
                        &format!("revision push notebook error: {notebook_id}: {error}"),
                    );
                }
            }
            SyncCommand::PushDeletion(entity_id) => {
                if let Err(error) = push_deletion_revision(
                    app,
                    active_relay_url,
                    backup_relay_urls,
                    keys,
                    &entity_id,
                )
                .await
                {
                    sync_log(
                        app,
                        &format!("revision delete push error: {entity_id}: {error}"),
                    );
                }
            }
        }
    }

    Ok(())
}

fn log_bootstrap_result(app: &AppHandle, relay_url: &str, bootstrap: &RevisionBootstrapResult) {
    sync_log(
        app,
        &format!(
            "revision bootstrap relay={} snapshot_seq={} have={} need={}",
            relay_url,
            bootstrap.snapshot_seq,
            bootstrap.have.len(),
            bootstrap.need.len()
        ),
    );
}

async fn handle_revision_push_command(
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
            sync_log(app, &format!("queued revision push {note_id}"));
            pending_pushes.insert(note_id, tokio::time::Instant::now() + debounce_duration);
        }
        Some(SyncCommand::PushNotebook(notebook_id)) => {
            if let Err(error) =
                push_notebook_revision(app, active_relay_url, backup_relay_urls, keys, &notebook_id)
                    .await
            {
                sync_log(
                    app,
                    &format!("revision push notebook error: {notebook_id}: {error}"),
                );
            }
        }
        Some(SyncCommand::PushDeletion(id)) => {
            if let Err(error) =
                push_deletion_revision(app, active_relay_url, backup_relay_urls, keys, &id).await
            {
                sync_log(app, &format!("revision delete push error: {id}: {error}"));
            }
        }
        None => return Ok(()),
    }

    Ok(())
}

async fn handle_revision_incoming_message(
    app: &AppHandle,
    message: crate::adapters::nostr::relay_client::RevisionRelayIncomingMessage,
    keys: &Keys,
    relay_url: &str,
    state: &Arc<Mutex<SyncState>>,
    connected: &mut bool,
) -> Result<(), AppError> {
    match message {
        crate::adapters::nostr::relay_client::RevisionRelayIncomingMessage::ChangesEvent {
            seq,
            event,
            ..
        } => {
            let conn = crate::db::database_connection(app)?;
            if let Some(change) = crate::domain::sync::revision_apply_service::apply_remote_revision_event(
                &conn,
                relay_url,
                keys,
                &event,
                Some(seq),
                |note_id| {
                    app.state::<crate::infra::cache::RenderedHtmlCache>()
                        .invalidate(note_id);
                },
            )? {
                emit_sync_remote_change(app, change);
            }
        }
        crate::adapters::nostr::relay_client::RevisionRelayIncomingMessage::ChangesEose {
            last_seq,
            ..
        } => {
            let conn = crate::db::database_connection(app)?;
            let relay_state = crate::adapters::sqlite::revision_sync_repository::get_sync_relay_state(
                &conn, relay_url,
            )?;
            let min_payload_mtime =
                relay_state.as_ref().and_then(|state| state.min_payload_mtime);
            let snapshot_seq = relay_state.as_ref().and_then(|state| state.snapshot_seq);
            // `last_seq` is the live `CHANGES` progress marker. Preserve the
            // original bootstrap `snapshot_seq` so the handoff boundary remains
            // distinguishable from the live checkpoint.
            crate::adapters::sqlite::revision_sync_repository::upsert_sync_relay_state(
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
        crate::adapters::nostr::relay_client::RevisionRelayIncomingMessage::ChangesErr {
            message,
            ..
        } => {
            return Err(AppError::custom(format!(
                "Revision relay CHANGES error: {message}"
            )));
        }
        crate::adapters::nostr::relay_client::RevisionRelayIncomingMessage::Notice(message) => {
            sync_log(app, &format!("relay notice: {message}"));
        }
        crate::adapters::nostr::relay_client::RevisionRelayIncomingMessage::NegErr {
            message,
            ..
        } => {
            return Err(AppError::custom(format!(
                "Revision relay NEG error: {message}"
            )));
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
            "INSERT INTO notebooks (id, name, created_at, updated_at, locally_modified)
             VALUES ('notebook-1', 'Notebook', 100, 300, 1)",
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
        assert_eq!(commands.len(), 3);
        assert!(matches!(&commands[0], SyncCommand::PushDeletion(id) if id == "note-2"));
        assert!(matches!(&commands[1], SyncCommand::PushNote(id) if id == "note-1"));
        assert!(matches!(&commands[2], SyncCommand::PushNotebook(id) if id == "notebook-1"));
    }
}

fn emit_sync_remote_change(app: &AppHandle, payload: SyncChangePayload) {
    let _ = app.emit("sync-remote-change", payload);
}

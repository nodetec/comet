use crate::adapters::sqlite::sync_repository::{get_checkpoint, get_sync_relay_url};
use crate::app_state::AppState;
use crate::domain::sync::model::{SyncCommand, SyncState, SyncStatusPayload};
use crate::error::AppError;
use futures_util::{SinkExt, StreamExt};
use nostr_sdk::prelude::*;
use rusqlite::OptionalExtension;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{mpsc, watch, Mutex};
use tokio::task::JoinHandle;
use tokio_tungstenite::{connect_async, tungstenite::Message};

use super::sync_pull::{process_relay_message, wait_for_ok};
use super::sync_push::{push_deletion, push_note, push_notebook};

/// Emit a sync log line to both stderr and the frontend.
pub(super) fn sync_log(state: &Arc<AppState>, msg: &str) {
    eprintln!("[sync] {msg}");
    state.emit("sync-log", &serde_json::to_string(&msg.to_string()).unwrap_or_default());
}

// ── SyncManager ────────────────────────────────────────────────────────

#[derive(Clone)]
pub struct SyncManager {
    state: Arc<Mutex<SyncState>>,
    task_handle: Arc<Mutex<Option<JoinHandle<()>>>>,
    push_tx: Arc<Mutex<Option<mpsc::Sender<SyncCommand>>>>,
    shutdown_tx: Arc<Mutex<Option<watch::Sender<bool>>>>,
}

impl SyncManager {
    pub fn new() -> Self {
        Self {
            state: Arc::new(Mutex::new(SyncState::Disconnected)),
            task_handle: Arc::new(Mutex::new(None)),
            push_tx: Arc::new(Mutex::new(None)),
            shutdown_tx: Arc::new(Mutex::new(None)),
        }
    }

    pub async fn state(&self) -> SyncState {
        self.state.lock().await.clone()
    }

    pub async fn push(&self, cmd: SyncCommand) {
        if let Some(tx) = self.push_tx.lock().await.as_ref() {
            let _ = tx.send(cmd).await;
        }
    }

    pub async fn start(&self, state: Arc<AppState>) {
        self.stop().await;

        let (shutdown_tx, shutdown_rx) = watch::channel(false);
        let (push_tx, push_rx) = mpsc::channel::<SyncCommand>(256);

        *self.shutdown_tx.lock().await = Some(shutdown_tx);
        *self.push_tx.lock().await = Some(push_tx);

        let sync_state = self.state.clone();
        let handle = tokio::spawn(async move {
            run_sync_loop(state, sync_state, shutdown_rx, push_rx).await;
        });

        *self.task_handle.lock().await = Some(handle);
    }

    pub async fn stop(&self) {
        if let Some(tx) = self.shutdown_tx.lock().await.take() {
            let _ = tx.send(true);
        }
        if let Some(handle) = self.task_handle.lock().await.take() {
            let _ = handle.await;
        }
        *self.push_tx.lock().await = None;
        *self.state.lock().await = SyncState::Disconnected;
    }
}

// ── Auto-start ─────────────────────────────────────────────────────────

pub async fn auto_start(state: Arc<AppState>) {
    if let Err(error) = start_if_ready(&state).await {
        sync_log(&state, &format!("failed to initialize sync: {error}"));
    }
}

pub async fn start_if_ready(state: &Arc<AppState>) -> Result<(), AppError> {
    let readiness = {
        let conn = match crate::db::database_connection(state) {
            Ok(c) => c,
            Err(error) => return Err(error),
        };
        let has_relay = get_sync_relay_url(&conn).is_some();
        let enabled = conn
            .query_row(
                "SELECT value FROM app_settings WHERE key = 'sync_enabled'",
                [],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .ok()
            .flatten()
            .as_deref()
            == Some("true");
        let unlocked = if has_relay && enabled {
            crate::adapters::mobile::key_store::is_current_identity_unlocked(state, &conn)?
        } else {
            false
        };
        (has_relay, enabled, unlocked)
    };

    let manager = &state.sync_manager;
    let (has_relay, enabled, unlocked) = readiness;

    if !has_relay || !enabled {
        manager.stop().await;
        return Ok(());
    }

    if !unlocked {
        manager.stop().await;
        set_state(&manager.state, SyncState::NeedsUnlock, state).await;
        return Ok(());
    }

    manager.start(state.clone()).await;
    Ok(())
}

// ── Sync loop ──────────────────────────────────────────────────────────

pub(super) async fn set_state(
    sync_state: &Arc<Mutex<SyncState>>,
    new_state: SyncState,
    state: &Arc<AppState>,
) {
    *sync_state.lock().await = new_state.clone();
    state.emit(
        "sync-status",
        &serde_json::to_string(&SyncStatusPayload { state: new_state }).unwrap_or_default(),
    );
}

async fn run_sync_loop(
    state: Arc<AppState>,
    sync_state: Arc<Mutex<SyncState>>,
    mut shutdown_rx: watch::Receiver<bool>,
    mut push_rx: mpsc::Receiver<SyncCommand>,
) {
    let mut backoff = Duration::from_secs(1);
    let max_backoff = Duration::from_secs(30);

    loop {
        let started = tokio::time::Instant::now();
        match run_sync_connection(&state, &sync_state, &mut shutdown_rx, &mut push_rx).await {
            Ok(()) => break, // clean shutdown
            Err(e) => {
                sync_log(&state, &format!("connection error: {e}"));
                set_state(
                    &sync_state,
                    SyncState::Error {
                        message: e.to_string(),
                    },
                    &state,
                )
                .await;

                // Reset backoff if we were connected for a meaningful duration
                if started.elapsed() > Duration::from_secs(60) {
                    backoff = Duration::from_secs(1);
                }

                // Backoff before reconnect
                tokio::select! {
                    () = tokio::time::sleep(backoff) => {},
                    _ = shutdown_rx.changed() => break,
                }
                backoff = (backoff * 2).min(max_backoff);
            }
        }
    }

    set_state(&sync_state, SyncState::Disconnected, &state).await;
}

async fn run_sync_connection(
    state: &Arc<AppState>,
    sync_state: &Arc<Mutex<SyncState>>,
    shutdown_rx: &mut watch::Receiver<bool>,
    push_rx: &mut mpsc::Receiver<SyncCommand>,
) -> Result<(), AppError> {
    // Read config from DB
    let (relay_url, keys) = {
        let conn = crate::db::database_connection(state)?;
        let relay_url = get_sync_relay_url(&conn)
            .ok_or_else(|| AppError::custom("No sync relay configured"))?;
        let (keys, _) = crate::adapters::mobile::key_store::keys_for_current_identity(state, &conn)?;
        (relay_url, keys)
    };
    let pubkey = keys.public_key();

    // Connect WebSocket
    sync_log(state, &format!("connecting to {relay_url}"));
    set_state(sync_state, SyncState::Connecting, state).await;

    let (ws_stream, _) = connect_async(&relay_url)
        .await
        .map_err(|e| AppError::custom(format!("WebSocket connection failed: {e}")))?;

    let (mut ws_write, mut ws_read) = ws_stream.split();

    // Wait for AUTH challenge
    set_state(sync_state, SyncState::Authenticating, state).await;

    let challenge = loop {
        tokio::select! {
            msg = ws_read.next() => {
                match msg {
                    Some(Ok(Message::Text(ref text))) => {
                        let parsed: serde_json::Value = serde_json::from_str(text.as_ref())
                            .map_err(|e| AppError::custom(format!("Invalid JSON from relay: {e}")))?;
                        if let Some(arr) = parsed.as_array() {
                            if arr.first().and_then(|v| v.as_str()) == Some("AUTH") {
                                if let Some(c) = arr.get(1).and_then(|v| v.as_str()) {
                                    break c.to_string();
                                }
                            }
                        }
                    }
                    Some(Err(e)) => return Err(AppError::custom(format!("WebSocket error: {e}"))),
                    None => return Err(AppError::custom("Connection closed before AUTH")),
                    _ => {}
                }
            }
            _ = shutdown_rx.changed() => return Ok(()),
        }
    };

    // Sign and send AUTH event
    let auth_event = EventBuilder::new(Kind::Custom(22242), "")
        .tags(vec![
            Tag::custom(TagKind::custom("relay"), vec![relay_url.clone()]),
            Tag::custom(TagKind::custom("challenge"), vec![challenge]),
        ])
        .sign_with_keys(&keys)
        .map_err(|e| AppError::custom(format!("Failed to sign AUTH event: {e}")))?;

    let auth_json: serde_json::Value = serde_json::from_str(&auth_event.as_json())
        .map_err(|e| AppError::custom(format!("Failed to serialize AUTH event: {e}")))?;
    let auth_msg = serde_json::json!(["AUTH", auth_json]);
    ws_write
        .send(Message::from(auth_msg.to_string()))
        .await
        .map_err(|e| AppError::custom(format!("Failed to send AUTH: {e}")))?;

    // Wait for OK
    let ok = wait_for_ok(&mut ws_read, shutdown_rx).await?;
    if !ok {
        return Err(AppError::custom("AUTH rejected by relay"));
    }
    sync_log(state, "authenticated");

    // Read checkpoint and subscribe to CHANGES
    set_state(sync_state, SyncState::Syncing, state).await;

    let checkpoint = {
        let conn = crate::db::database_connection(state)?;
        get_checkpoint(&conn)
    };

    let changes_msg = serde_json::json!([
        "CHANGES", "sync",
        {
            "since": checkpoint,
            "kinds": [1059],
            "#p": [pubkey.to_hex()],
            "live": true
        }
    ]);
    ws_write
        .send(Message::from(changes_msg.to_string()))
        .await
        .map_err(|e| AppError::custom(format!("Failed to send CHANGES: {e}")))?;
    sync_log(state, &format!("subscribed since={checkpoint}"));

    // Track recently pushed event IDs to avoid echo
    let mut recent_pushes: HashMap<String, std::time::Instant> = HashMap::new();

    // Debounce timers for push commands
    let mut pending_pushes: HashMap<String, tokio::time::Instant> = HashMap::new();
    let debounce_duration = Duration::from_secs(2);
    let mut last_ping = tokio::time::Instant::now();
    let ping_interval = Duration::from_secs(30);
    let mut post_eose = false;

    // Main select loop
    loop {
        // Send keepalive ping if no activity
        if last_ping.elapsed() >= ping_interval {
            ws_write
                .send(Message::Ping(vec![].into()))
                .await
                .map_err(|e| AppError::custom(format!("Ping failed: {e}")))?;
            last_ping = tokio::time::Instant::now();
        }
        // Fire any ready debounced pushes before waiting for new events
        let now = tokio::time::Instant::now();
        let ready: Vec<String> = pending_pushes
            .iter()
            .filter(|(_, deadline)| **deadline <= now)
            .map(|(id, _)| id.clone())
            .collect();
        for note_id in &ready {
            pending_pushes.remove(note_id);
            sync_log(state, &format!("pushing {note_id}"));
            if let Err(e) = push_note(state, &keys, &mut ws_write, note_id, &mut recent_pushes).await
            {
                sync_log(state, &format!("push error: {note_id}: {e}"));
            }
        }

        // Compute sleep duration — wake for debounced pushes or keepalive ping
        let next_ping = last_ping + ping_interval;
        let next_wake = pending_pushes
            .values()
            .min()
            .copied()
            .map_or(next_ping, |d| d.min(next_ping));
        let debounce_sleep = tokio::time::sleep_until(next_wake);
        tokio::pin!(debounce_sleep);

        tokio::select! {
            () = &mut debounce_sleep => {
                // Loop will fire ready pushes at the top
            }

            msg = ws_read.next() => {
                last_ping = tokio::time::Instant::now();
                match msg {
                    Some(Ok(Message::Text(ref text))) => {
                        process_relay_message(
                            state, &keys, text.as_ref(), sync_state,
                            &mut recent_pushes, &mut post_eose,
                        ).await?;
                    }
                    Some(Ok(Message::Close(_))) | None => {
                        return Err(AppError::custom("Connection closed by relay"));
                    }
                    Some(Err(e)) => return Err(AppError::custom(format!("WebSocket error: {e}"))),
                    _ => {}
                }
            }

            cmd = push_rx.recv() => {
                match cmd {
                    Some(SyncCommand::PushNote(note_id)) => {
                        sync_log(state, &format!("queued push {note_id}"));
                        pending_pushes.insert(
                            note_id,
                            tokio::time::Instant::now() + debounce_duration,
                        );
                    }
                    Some(SyncCommand::PushNotebook(notebook_id)) => {
                        sync_log(state, &format!("pushing notebook {notebook_id}"));
                        if let Err(e) = push_notebook(state, &keys, &mut ws_write, &notebook_id, &mut recent_pushes).await {
                            sync_log(state, &format!("push notebook error: {notebook_id}: {e}"));
                        }
                    }
                    Some(SyncCommand::PushDeletion(id)) => {
                        sync_log(state, &format!("pushing deletion {id}"));
                        if let Err(e) = push_deletion(state, &keys, &mut ws_write, &id, &mut recent_pushes).await {
                            sync_log(state, &format!("push deletion error: {id}: {e}"));
                        }
                    }
                    None => break, // channel closed
                }
            }

            _ = shutdown_rx.changed() => return Ok(()),
        }

        // Clean up old recent pushes (older than 60s)
        recent_pushes.retain(|_, t| t.elapsed() < Duration::from_secs(60));
    }

    Ok(())
}

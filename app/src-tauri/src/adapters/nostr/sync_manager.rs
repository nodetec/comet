use crate::adapters::sqlite::sync_repository::{get_checkpoint, get_sync_relay_url};
use crate::domain::sync::model::{SyncCommand, SyncState, SyncStatusPayload};
use crate::error::AppError;
use futures_util::{SinkExt, StreamExt};
use nostr_sdk::prelude::*;
use rusqlite::OptionalExtension;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::{mpsc, watch, Mutex};
use tokio::task::JoinHandle;
use tokio_tungstenite::{connect_async, tungstenite::Message};

use super::sync_pull::{process_relay_message, wait_for_ok};
use super::sync_push::{push_deletion, push_note, push_notebook};

/// Emit a sync log line to both stderr and the frontend.
pub(super) fn sync_log(app: &AppHandle, msg: &str) {
    eprintln!("[sync] {msg}");
    let _ = app.emit("sync-log", msg.to_string());
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

    pub async fn start(&self, app: AppHandle) {
        self.stop().await;

        let (shutdown_tx, shutdown_rx) = watch::channel(false);
        let (push_tx, push_rx) = mpsc::channel::<SyncCommand>(256);

        *self.shutdown_tx.lock().await = Some(shutdown_tx);
        *self.push_tx.lock().await = Some(push_tx);

        let state = self.state.clone();
        let handle = tokio::spawn(async move {
            run_sync_loop(app, state, shutdown_rx, push_rx).await;
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

pub async fn auto_start(app: &AppHandle) {
    if let Err(error) = start_if_ready(app).await {
        sync_log(app, &format!("failed to initialize sync: {error}"));
    }
}

pub async fn start_if_ready(app: &AppHandle) -> Result<(), AppError> {
    let readiness = {
        let conn = match crate::db::database_connection(app) {
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
            crate::adapters::tauri::key_store::is_current_identity_unlocked(app, &conn)?
        } else {
            false
        };
        (has_relay, enabled, unlocked)
    };

    let manager = app.state::<SyncManager>();
    let (has_relay, enabled, unlocked) = readiness;

    if !has_relay || !enabled {
        manager.stop().await;
        return Ok(());
    }

    if !unlocked {
        manager.stop().await;
        set_state(&manager.state, SyncState::NeedsUnlock, app).await;
        return Ok(());
    }

    manager.start(app.clone()).await;
    Ok(())
}

// ── Sync loop ──────────────────────────────────────────────────────────

pub(super) async fn set_state(
    state: &Arc<Mutex<SyncState>>,
    new_state: SyncState,
    app: &AppHandle,
) {
    *state.lock().await = new_state.clone();
    let _ = app.emit("sync-status", SyncStatusPayload { state: new_state });
}

async fn run_sync_loop(
    app: AppHandle,
    state: Arc<Mutex<SyncState>>,
    mut shutdown_rx: watch::Receiver<bool>,
    mut push_rx: mpsc::Receiver<SyncCommand>,
) {
    let mut backoff = Duration::from_secs(1);
    let max_backoff = Duration::from_secs(30);

    loop {
        let started = tokio::time::Instant::now();
        match run_sync_connection(&app, &state, &mut shutdown_rx, &mut push_rx).await {
            Ok(()) => break, // clean shutdown
            Err(e) => {
                sync_log(&app, &format!("connection error: {e}"));
                set_state(
                    &state,
                    SyncState::Error {
                        message: e.to_string(),
                    },
                    &app,
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

    set_state(&state, SyncState::Disconnected, &app).await;
}

async fn run_sync_connection(
    app: &AppHandle,
    state: &Arc<Mutex<SyncState>>,
    shutdown_rx: &mut watch::Receiver<bool>,
    push_rx: &mut mpsc::Receiver<SyncCommand>,
) -> Result<(), AppError> {
    // Read config from DB
    let (relay_url, keys) = {
        let conn = crate::db::database_connection(app)?;
        let relay_url = get_sync_relay_url(&conn)
            .ok_or_else(|| AppError::custom("No sync relay configured"))?;
        let (keys, _) = crate::adapters::tauri::key_store::keys_for_current_identity(app, &conn)?;
        (relay_url, keys)
    };
    let pubkey = keys.public_key();

    // Connect WebSocket
    sync_log(app, &format!("connecting to {relay_url}"));
    set_state(state, SyncState::Connecting, app).await;

    let (ws_stream, _) = connect_async(&relay_url)
        .await
        .map_err(|e| AppError::custom(format!("WebSocket connection failed: {e}")))?;

    let (mut ws_write, mut ws_read) = ws_stream.split();

    // Wait for AUTH challenge
    set_state(state, SyncState::Authenticating, app).await;

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
    sync_log(app, "authenticated");

    // Read checkpoint and subscribe to CHANGES
    set_state(state, SyncState::Syncing, app).await;

    let checkpoint = {
        let conn = crate::db::database_connection(app)?;
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
    sync_log(app, &format!("subscribed since={checkpoint}"));

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
            sync_log(app, &format!("pushing {note_id}"));
            if let Err(e) = push_note(app, &keys, &mut ws_write, note_id, &mut recent_pushes).await
            {
                sync_log(app, &format!("push error: {note_id}: {e}"));
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
                            app, &keys, text.as_ref(), state,
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
                        sync_log(app, &format!("queued push {note_id}"));
                        pending_pushes.insert(
                            note_id,
                            tokio::time::Instant::now() + debounce_duration,
                        );
                    }
                    Some(SyncCommand::PushNotebook(notebook_id)) => {
                        sync_log(app, &format!("pushing notebook {notebook_id}"));
                        if let Err(e) = push_notebook(app, &keys, &mut ws_write, &notebook_id, &mut recent_pushes).await {
                            sync_log(app, &format!("push notebook error: {notebook_id}: {e}"));
                        }
                    }
                    Some(SyncCommand::PushDeletion(id)) => {
                        sync_log(app, &format!("pushing deletion {id}"));
                        if let Err(e) = push_deletion(app, &keys, &mut ws_write, &id, &mut recent_pushes).await {
                            sync_log(app, &format!("push deletion error: {id}: {e}"));
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

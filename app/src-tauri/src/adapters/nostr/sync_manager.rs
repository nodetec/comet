use crate::domain::sync::model::{
    SyncChangePayload, SyncCommand, SyncState, SyncStatusPayload, SyncedNote, SyncedNotebook,
};
use crate::error::{now_millis, AppError};
use futures_util::{SinkExt, StreamExt};
use hmac::{Hmac, Mac};
use nostr_sdk::prelude::*;
use rusqlite::{params, Connection, OptionalExtension};
use sha2::Sha256;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::{mpsc, watch, Mutex};
use tokio::task::JoinHandle;
use tokio_tungstenite::{connect_async, tungstenite::Message};

/// Emit a sync log line to both stderr and the frontend.
fn sync_log(app: &AppHandle, msg: &str) {
    eprintln!("[sync] {msg}");
    let _ = app.emit("sync-log", msg.to_string());
}

fn delete_note_from_sync(
    conn: &Connection,
    note_id: &str,
    mut invalidate_cache: impl FnMut(&str),
) -> Result<(), AppError> {
    conn.execute("DELETE FROM notes_fts WHERE note_id = ?1", params![note_id])?;
    conn.execute("DELETE FROM notes WHERE id = ?1", params![note_id])?;
    invalidate_cache(note_id);
    Ok(())
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

// ── DB helpers ──────────────────────────────────────────────────────────

pub(crate) fn get_blossom_url(conn: &Connection) -> Option<String> {
    conn.query_row(
        "SELECT value FROM app_settings WHERE key = 'blossom_url'",
        [],
        |row| row.get(0),
    )
    .optional()
    .ok()
    .flatten()
}

pub(crate) fn get_sync_relay_url(conn: &Connection) -> Option<String> {
    conn.query_row(
        "SELECT url FROM relays WHERE kind = 'sync' LIMIT 1",
        [],
        |row| row.get(0),
    )
    .optional()
    .ok()
    .flatten()
}

pub(crate) fn get_checkpoint(conn: &Connection) -> i64 {
    conn.query_row(
        "SELECT value FROM app_settings WHERE key = 'sync_checkpoint'",
        [],
        |row| row.get::<_, String>(0),
    )
    .optional()
    .ok()
    .flatten()
    .and_then(|v| v.parse::<i64>().ok())
    .unwrap_or(0)
}

fn save_checkpoint(conn: &Connection, seq: i64) {
    let _ = conn.execute(
        "INSERT OR REPLACE INTO app_settings (key, value) VALUES ('sync_checkpoint', ?1)",
        params![seq.to_string()],
    );
}

// ── Note ↔ Event mapping ───────────────────────────────────────────────

use crate::domain::sync::event_codec::{
    deleted_note_rumor, deleted_notebook_rumor, is_deleted_rumor, is_notebook_rumor,
    note_to_rumor, notebook_to_rumor, rumor_to_synced_note, rumor_to_synced_notebook,
};

fn upsert_notebook_from_sync(
    conn: &Connection,
    notebook: &SyncedNotebook,
    sync_event_id: &str,
) -> Result<(), AppError> {
    let existing: Option<i64> = conn
        .query_row(
            "SELECT updated_at FROM notebooks WHERE id = ?1",
            params![notebook.id],
            |row| row.get(0),
        )
        .optional()?;

    if let Some(local_updated) = existing {
        if local_updated >= notebook.updated_at {
            // Local version is same or newer — just update sync_event_id
            conn.execute(
                "UPDATE notebooks SET sync_event_id = ?1 WHERE id = ?2",
                params![sync_event_id, notebook.id],
            )?;
            return Ok(());
        }
        conn.execute(
            "UPDATE notebooks SET name = ?1, updated_at = ?2, sync_event_id = ?3, locally_modified = 0 WHERE id = ?4",
            params![notebook.name, notebook.updated_at, sync_event_id, notebook.id],
        )?;
    } else {
        conn.execute(
            "INSERT INTO notebooks (id, name, created_at, updated_at, sync_event_id, locally_modified) \
             VALUES (?1, ?2, ?3, ?3, ?4, 0)",
            params![notebook.id, notebook.name, notebook.updated_at, sync_event_id],
        )?;
    }
    Ok(())
}

/// Compute a deterministic d-tag for a gift wrap using HMAC-SHA256.
/// This allows the relay to replace old versions without leaking the note ID.
fn gift_wrap_d_tag(secret_key: &SecretKey, note_id: &str) -> String {
    let mut mac = Hmac::<Sha256>::new_from_slice(secret_key.as_secret_bytes())
        .expect("HMAC accepts any key size");
    mac.update(note_id.as_bytes());
    hex::encode(mac.finalize().into_bytes())
}

use crate::domain::blob::service::{
    cleanup_orphaned_blobs, extract_attachment_hashes, find_orphaned_blob_hashes,
};

// ── Upsert from sync ───────────────────────────────────────────────────

fn upsert_from_sync(
    conn: &Connection,
    note: &SyncedNote,
    sync_event_id: &str,
) -> Result<Option<String>, AppError> {
    let existing: Option<(String, i64)> = conn
        .query_row(
            "SELECT id, modified_at FROM notes WHERE id = ?1",
            params![note.id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()?;

    if let Some((_, local_modified)) = &existing {
        if *local_modified >= note.modified_at {
            eprintln!(
                "[sync] skip upsert note={} local_modified={} remote_modified={}",
                note.id, local_modified, note.modified_at
            );
            // Local version is same or newer — just update sync_event_id
            conn.execute(
                "UPDATE notes SET sync_event_id = ?1 WHERE id = ?2",
                params![sync_event_id, note.id],
            )?;
            return Ok(None);
        }
    }

    // Ensure referenced notebook exists (it may arrive after the note in the sync stream).
    // Stub gets updated_at = 0 so the real notebook event always wins LWW.
    if let Some(ref nb_id) = note.notebook_id {
        let now = now_millis();
        conn.execute(
            "INSERT OR IGNORE INTO notebooks (id, name, created_at, updated_at, locally_modified) VALUES (?1, ?1, ?2, 0, 0)",
            params![nb_id, now],
        )?;
    }

    if existing.is_some() {
        // Update existing note
        conn.execute(
            "UPDATE notes SET title = ?1, markdown = ?2, notebook_id = ?3, modified_at = ?4, edited_at = ?5, \
             archived_at = ?6, deleted_at = ?7, pinned_at = ?8, readonly = ?9, sync_event_id = ?10, locally_modified = 0 WHERE id = ?11",
            params![
                note.title,
                note.markdown,
                note.notebook_id,
                note.modified_at,
                note.edited_at,
                note.archived_at,
                note.deleted_at,
                note.pinned_at,
                i32::from(note.readonly),
                sync_event_id,
                note.id,
            ],
        )?;
    } else {
        // Insert new note
        conn.execute(
            "INSERT INTO notes (id, title, markdown, notebook_id, created_at, modified_at, edited_at, \
             archived_at, deleted_at, pinned_at, readonly, sync_event_id, locally_modified) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, 0)",
            params![
                note.id,
                note.title,
                note.markdown,
                note.notebook_id,
                note.created_at,
                note.modified_at,
                note.edited_at,
                note.archived_at,
                note.deleted_at,
                note.pinned_at,
                i32::from(note.readonly),
                sync_event_id,
            ],
        )?;
    }

    // Update tags
    conn.execute("DELETE FROM note_tags WHERE note_id = ?1", params![note.id])?;
    for tag in &note.tags {
        conn.execute(
            "INSERT OR IGNORE INTO note_tags (note_id, tag) VALUES (?1, ?2)",
            params![note.id, tag],
        )?;
    }

    // Update FTS
    conn.execute("DELETE FROM notes_fts WHERE note_id = ?1", params![note.id])?;
    conn.execute(
        "INSERT INTO notes_fts (note_id, title, markdown) VALUES (?1, ?2, ?3)",
        params![note.id, note.title, note.markdown],
    )?;

    Ok(Some(note.id.clone()))
}

// ── Sync loop ──────────────────────────────────────────────────────────

async fn set_state(state: &Arc<Mutex<SyncState>>, new_state: SyncState, app: &AppHandle) {
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

async fn wait_for_ok(
    ws_read: &mut futures_util::stream::SplitStream<
        tokio_tungstenite::WebSocketStream<
            tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
        >,
    >,
    shutdown_rx: &mut watch::Receiver<bool>,
) -> Result<bool, AppError> {
    loop {
        tokio::select! {
            msg = ws_read.next() => {
                match msg {
                    Some(Ok(Message::Text(ref text))) => {
                        let parsed: serde_json::Value = serde_json::from_str(text.as_ref())
                            .map_err(|e| AppError::custom(format!("Invalid JSON: {e}")))?;
                        if let Some(arr) = parsed.as_array() {
                            if arr.first().and_then(|v| v.as_str()) == Some("OK") {
                                return Ok(arr.get(2).and_then(serde_json::Value::as_bool).unwrap_or(false));
                            }
                        }
                    }
                    Some(Err(e)) => return Err(AppError::custom(format!("WebSocket error: {e}"))),
                    None => return Err(AppError::custom("Connection closed")),
                    _ => {}
                }
            }
            _ = shutdown_rx.changed() => return Err(AppError::custom("Shutdown")),
        }
    }
}

// ── Process incoming relay messages ────────────────────────────────────

async fn process_relay_message(
    app: &AppHandle,
    keys: &Keys,
    text: &str,
    state: &Arc<Mutex<SyncState>>,
    recent_pushes: &mut HashMap<String, std::time::Instant>,
    post_eose: &mut bool,
) -> Result<(), AppError> {
    let parsed: serde_json::Value =
        serde_json::from_str(text).map_err(|e| AppError::custom(format!("Invalid JSON: {e}")))?;

    let arr = match parsed.as_array() {
        Some(a) => a,
        None => return Ok(()),
    };

    let msg_type = arr.first().and_then(|v| v.as_str()).unwrap_or("");

    if msg_type != "CHANGES" {
        return Ok(());
    }

    let sub_type = arr.get(2).and_then(|v| v.as_str()).unwrap_or("");

    match sub_type {
        "EVENT" => {
            let seq = arr.get(3).and_then(serde_json::Value::as_i64).unwrap_or(0);
            let event_json = arr
                .get(4)
                .ok_or_else(|| AppError::custom("Missing event in CHANGES EVENT"))?;

            let event: Event = Event::from_json(event_json.to_string())
                .map_err(|e| AppError::custom(format!("Invalid event: {e}")))?;

            let event_id = event.id.to_hex();

            // Skip echo (events we just pushed)
            if recent_pushes.contains_key(&event_id) {
                sync_log(app, &format!("echo skip seq={seq}"));
                return Ok(());
            }
            sync_log(app, &format!("received event seq={seq}"));

            // Unwrap gift wrap (skip events we can't decrypt, e.g. from a previous key)
            let unwrapped = match crate::adapters::nostr::nip59_ext::extract_rumor(keys, &event) {
                Ok(u) => u,
                Err(e) => {
                    sync_log(app, &format!("skip undecryptable event: {e}"));
                    return Ok(());
                }
            };

            // Check for deletion tombstone
            if is_deleted_rumor(&unwrapped.rumor) {
                let entity_id = unwrapped
                    .rumor
                    .tags
                    .find(TagKind::d())
                    .and_then(|t| t.content())
                    .unwrap_or_default()
                    .to_string();
                sync_log(app, &format!("received delete for {entity_id}"));

                let conn = crate::db::database_connection(app)?;

                if is_notebook_rumor(&unwrapped.rumor) {
                    // Delete notebook
                    conn.execute("DELETE FROM notebooks WHERE id = ?1", params![entity_id])?;
                } else {
                    // Collect orphaned blobs before deleting the note
                    let orphaned =
                        find_orphaned_blob_hashes(&conn, &[entity_id.clone()]).unwrap_or_default();
                    // Permanently delete the note
                    delete_note_from_sync(&conn, &entity_id, |note_id| {
                        app.state::<crate::infra::cache::RenderedHtmlCache>().invalidate(note_id);
                    })?;
                    // Clean up orphaned blobs (local + metadata)
                    let blossom_deletions = cleanup_orphaned_blobs(app, &conn, &orphaned);
                    // Spawn Blossom deletes in background to not block sync
                    if !blossom_deletions.is_empty() {
                        let keys = keys.clone();
                        tokio::spawn(async move {
                            let http_client = reqwest::Client::new();
                            for (server_url, ciphertext_hash) in blossom_deletions {
                                if let Err(e) = crate::adapters::blossom::client::delete_blob(
                                    &http_client,
                                    &server_url,
                                    &ciphertext_hash,
                                    &keys,
                                )
                                .await
                                {
                                    eprintln!("[blob-gc] blossom delete failed: {e}");
                                }
                            }
                        });
                    }
                }

                let _ = app.emit(
                    "sync-remote-change",
                    SyncChangePayload {
                        note_id: entity_id,
                        action: "delete".to_string(),
                    },
                );
                return Ok(());
            }

            // Dispatch based on rumor kind
            if is_notebook_rumor(&unwrapped.rumor) {
                let notebook = match rumor_to_synced_notebook(&unwrapped.rumor) {
                    Ok(n) => n,
                    Err(e) => {
                        sync_log(app, &format!("skip malformed notebook: {e}"));
                        return Ok(());
                    }
                };
                sync_log(
                    app,
                    &format!("received notebook {} ({})", notebook.id, notebook.name),
                );

                let conn = crate::db::database_connection(app)?;
                if let Err(e) = upsert_notebook_from_sync(&conn, &notebook, &event_id) {
                    sync_log(app, &format!("notebook upsert failed {}: {e}", notebook.id));
                }

                let _ = app.emit(
                    "sync-remote-change",
                    SyncChangePayload {
                        note_id: notebook.id,
                        action: "upsert".to_string(),
                    },
                );
            } else {
                let synced_note = match rumor_to_synced_note(&unwrapped.rumor) {
                    Ok(n) => n,
                    Err(e) => {
                        sync_log(app, &format!("skip malformed note: {e}"));
                        return Ok(());
                    }
                };
                let note_id = synced_note.id.clone();
                sync_log(app, &format!("received note {note_id}"));

                let conn = crate::db::database_connection(app)?;
                let updated = upsert_from_sync(&conn, &synced_note, &event_id)?;
                if updated.is_some() {
                    sync_log(app, &format!("updated note {note_id}"));
                }

                let blossom_url = get_blossom_url(&conn);
                if let Some(blossom_url) = blossom_url {
                    download_missing_blobs(app, keys, &unwrapped.rumor, &blossom_url).await;
                }

                if updated.is_some() {
                    let _ = app.emit(
                        "sync-remote-change",
                        SyncChangePayload {
                            note_id,
                            action: "upsert".to_string(),
                        },
                    );
                }
            }

            // In live mode, checkpoint each event so we don't re-process on reconnect.
            // During initial catchup (pre-EOSE), skip per-event checkpoints — EOSE will set it.
            if *post_eose {
                let conn = crate::db::database_connection(app)?;
                save_checkpoint(&conn, seq);
            }
        }
        "EOSE" => {
            let max_seq = arr.get(3).and_then(serde_json::Value::as_i64).unwrap_or(0);
            sync_log(app, &format!("synced to seq={max_seq}"));
            let conn = crate::db::database_connection(app)?;
            save_checkpoint(&conn, max_seq);
            *post_eose = true;

            // Push any locally modified notes/notebooks (created or edited while offline)
            let (unsynced_notebooks, unsynced_notes) = {
                let mut stmt =
                    conn.prepare("SELECT id FROM notebooks WHERE locally_modified = 1")?;
                let nbs: Vec<String> = stmt
                    .query_map([], |row| row.get(0))?
                    .collect::<Result<Vec<_>, _>>()?;
                drop(stmt);

                let mut stmt = conn.prepare("SELECT id FROM notes WHERE locally_modified = 1")?;
                let notes: Vec<String> = stmt
                    .query_map([], |row| row.get(0))?
                    .collect::<Result<Vec<_>, _>>()?;

                (nbs, notes)
            }; // conn and stmts dropped here

            if !unsynced_notebooks.is_empty() || !unsynced_notes.is_empty() {
                sync_log(
                    app,
                    &format!(
                        "pushing {} unsynced notebooks, {} unsynced notes",
                        unsynced_notebooks.len(),
                        unsynced_notes.len()
                    ),
                );
            }

            // Process pending deletions (queued while offline)
            let pending_deletions: Vec<String> = {
                let mut stmt = conn.prepare("SELECT entity_id FROM pending_deletions")?;
                let ids: Vec<String> = stmt
                    .query_map([], |row| row.get(0))?
                    .collect::<Result<Vec<_>, _>>()?;
                ids
            };

            if !pending_deletions.is_empty() {
                sync_log(
                    app,
                    &format!("pushing {} pending deletions", pending_deletions.len()),
                );
            }

            let manager = app.state::<SyncManager>();
            for entity_id in &pending_deletions {
                manager
                    .push(SyncCommand::PushDeletion(entity_id.clone()))
                    .await;
            }
            for nb_id in unsynced_notebooks {
                manager.push(SyncCommand::PushNotebook(nb_id)).await;
            }
            for note_id in unsynced_notes {
                manager.push(SyncCommand::PushNote(note_id)).await;
            }

            set_state(state, SyncState::Connected, app).await;
        }
        "ERR" => {
            let message = arr
                .get(3)
                .and_then(|v| v.as_str())
                .unwrap_or("unknown error");
            return Err(AppError::custom(format!("CHANGES error: {message}")));
        }
        _ => {}
    }

    Ok(())
}

// ── Push note to relay ─────────────────────────────────────────────────

async fn push_note(
    app: &AppHandle,
    keys: &Keys,
    ws_write: &mut futures_util::stream::SplitSink<
        tokio_tungstenite::WebSocketStream<
            tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
        >,
        Message,
    >,
    note_id: &str,
    recent_pushes: &mut HashMap<String, std::time::Instant>,
) -> Result<(), AppError> {
    // Read note from DB
    let (
        title,
        markdown,
        notebook_id,
        created_at,
        modified_at,
        edited_at,
        archived_at,
        deleted_at,
        pinned_at,
        readonly,
        tags,
        blossom_url,
    ) = {
        let conn = crate::db::database_connection(app)?;

        let note: Option<(String, String, Option<String>, i64, i64, Option<i64>, Option<i64>, Option<i64>, Option<i64>, bool)> = conn
            .query_row(
                "SELECT title, markdown, notebook_id, created_at, modified_at, edited_at, archived_at, deleted_at, pinned_at, readonly FROM notes WHERE id = ?1",
                params![note_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?, row.get(6)?, row.get(7)?, row.get(8)?, row.get::<_, i64>(9)? != 0)),
            )
            .optional()?;

        let (
            title,
            markdown,
            notebook_id,
            created_at,
            modified_at,
            edited_at,
            archived_at,
            deleted_at,
            pinned_at,
            readonly,
        ) = note.ok_or_else(|| AppError::custom(format!("Note not found: {note_id}")))?;
        let edited_at = edited_at.unwrap_or(modified_at);

        // Get tags
        let mut tag_stmt = conn.prepare("SELECT tag FROM note_tags WHERE note_id = ?1")?;
        let tags: Vec<String> = tag_stmt
            .query_map(params![note_id], |row| row.get(0))?
            .collect::<Result<Vec<_>, _>>()?;

        let blossom_url = get_blossom_url(&conn);

        (
            title,
            markdown,
            notebook_id,
            created_at,
            modified_at,
            edited_at,
            archived_at,
            deleted_at,
            pinned_at,
            readonly,
            tags,
            blossom_url,
        )
    };

    // Upload attachment blobs to Blossom if configured
    let mut blob_tags: Vec<(String, String, String)> = Vec::new();
    let attachment_hashes = extract_attachment_hashes(&markdown);
    eprintln!(
        "[sync] note has {} attachment(s), blossom_url={:?}",
        attachment_hashes.len(),
        blossom_url
    );
    if let Some(ref blossom_url) = blossom_url {
        let http_client = reqwest::Client::new();
        let pubkey_hex = keys.public_key().to_hex();
        for hash in &attachment_hashes {
            eprintln!("[sync] processing attachment hash={}", &hash[..8]);
            let existing: Option<(String, String)> = {
                let conn = crate::db::database_connection(app)?;
                conn.query_row(
                    "SELECT ciphertext_hash, encryption_key FROM blob_meta WHERE plaintext_hash = ?1 AND server_url = ?2 AND pubkey = ?3",
                    params![hash, blossom_url, pubkey_hex],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                )
                .optional()?
            };

            if let Some((ct_hash, key_hex)) = existing {
                // Verify the ciphertext still exists on the server
                let head_url = format!("{}/{}", blossom_url.trim_end_matches('/'), ct_hash);
                let exists = http_client
                    .head(&head_url)
                    .send()
                    .await
                    .map(|r| r.status().is_success())
                    .unwrap_or(false);
                if exists {
                    eprintln!(
                        "[sync] attachment hash={} verified on server (ct={})",
                        &hash[..8],
                        &ct_hash[..8]
                    );
                    blob_tags.push((hash.clone(), ct_hash, key_hex));
                    continue;
                }
                // Blob missing from server — clear stale metadata and re-upload
                eprintln!(
                    "[sync] attachment hash={} missing from server, re-uploading",
                    &hash[..8]
                );
                let conn = crate::db::database_connection(app)?;
                conn.execute(
                    "DELETE FROM blob_meta WHERE plaintext_hash = ?1 AND server_url = ?2 AND pubkey = ?3",
                    params![hash, blossom_url, pubkey_hex],
                )?;
            }

            // Read the local blob
            let blob_data = if let Some((data, _ext)) = crate::adapters::filesystem::attachments::read_blob(app, hash)? {
                eprintln!(
                    "[sync] attachment hash={} read {} bytes locally",
                    &hash[..8],
                    data.len()
                );
                data
            } else {
                eprintln!(
                    "[sync] attachment hash={} NOT found locally, skipping",
                    &hash[..8]
                );
                continue;
            };

            // Encrypt with ChaCha20-Poly1305
            let (ciphertext_bytes, key_hex) = crate::adapters::blossom::client::encrypt_blob(&blob_data)?;

            // Upload to Blossom
            let ciphertext_hash =
                crate::adapters::blossom::client::upload_blob(&http_client, blossom_url, ciphertext_bytes, keys)
                    .await?;

            // Save blob metadata keyed to this server + identity
            let conn = crate::db::database_connection(app)?;
            conn.execute(
                "INSERT OR REPLACE INTO blob_meta (plaintext_hash, server_url, pubkey, ciphertext_hash, encryption_key) VALUES (?1, ?2, ?3, ?4, ?5)",
                params![hash, blossom_url, pubkey_hex, ciphertext_hash, key_hex],
            )?;
            conn.execute(
                "INSERT OR REPLACE INTO blob_uploads (hash, server_url, encrypted, size_bytes, uploaded_at) VALUES (?1, ?2, 1, ?3, ?4)",
                params![ciphertext_hash, blossom_url, blob_data.len() as i64, crate::error::now_millis()],
            )?;

            blob_tags.push((hash.clone(), ciphertext_hash, key_hex));
        }
    }

    // Build rumor
    let rumor = note_to_rumor(
        note_id,
        &title,
        &markdown,
        modified_at,
        edited_at,
        created_at,
        notebook_id.as_deref(),
        archived_at,
        deleted_at,
        pinned_at,
        readonly,
        &tags,
        &blob_tags,
        keys.public_key(),
    );

    // Gift wrap to self with HMAC'd d-tag for relay-side replacement
    let d_tag = gift_wrap_d_tag(keys.secret_key(), note_id);
    let gift_wrap =
        crate::adapters::nostr::nip59_ext::gift_wrap(keys, &keys.public_key(), rumor, [Tag::identifier(&d_tag)])?;

    let event_id = gift_wrap.id.to_hex();

    // Track as recently pushed (for echo prevention)
    recent_pushes.insert(event_id.clone(), std::time::Instant::now());

    // Send to relay
    let gift_wrap_json: serde_json::Value = serde_json::from_str(&gift_wrap.as_json())
        .map_err(|e| AppError::custom(format!("Failed to serialize gift wrap: {e}")))?;
    let event_msg = serde_json::json!(["EVENT", gift_wrap_json]);
    ws_write
        .send(Message::from(event_msg.to_string()))
        .await
        .map_err(|e| AppError::custom(format!("Failed to send event: {e}")))?;

    // Update sync_event_id and last_pushed_at in DB
    let conn = crate::db::database_connection(app)?;
    conn.execute(
        "UPDATE notes SET sync_event_id = ?1, locally_modified = 0 WHERE id = ?2",
        params![event_id, note_id],
    )?;

    sync_log(app, &format!("pushed note {note_id}"));

    Ok(())
}

async fn push_deletion(
    app: &AppHandle,
    keys: &Keys,
    ws_write: &mut futures_util::stream::SplitSink<
        tokio_tungstenite::WebSocketStream<
            tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
        >,
        Message,
    >,
    entity_id: &str,
    recent_pushes: &mut HashMap<String, std::time::Instant>,
) -> Result<(), AppError> {
    // Push a tombstone gift wrap — a deleted marker that replaces the current version
    // via the same HMAC'd d-tag. This is more reliable than NIP-09 since the relay's
    // replaceable gift wrap mechanism ensures the tombstone replaces the content.
    let is_notebook = entity_id.starts_with("notebook-");
    let rumor = if is_notebook {
        deleted_notebook_rumor(entity_id, keys.public_key())
    } else {
        deleted_note_rumor(entity_id, keys.public_key())
    };

    let d_tag_input = if is_notebook {
        format!("notebook:{entity_id}")
    } else {
        entity_id.to_string()
    };
    let d_tag = gift_wrap_d_tag(keys.secret_key(), &d_tag_input);
    let gift_wrap =
        crate::adapters::nostr::nip59_ext::gift_wrap(keys, &keys.public_key(), rumor, [Tag::identifier(&d_tag)])?;

    let event_id = gift_wrap.id.to_hex();
    recent_pushes.insert(event_id.clone(), std::time::Instant::now());

    let gift_wrap_json: serde_json::Value = serde_json::from_str(&gift_wrap.as_json())
        .map_err(|e| AppError::custom(format!("Failed to serialize gift wrap: {e}")))?;
    let event_msg = serde_json::json!(["EVENT", gift_wrap_json]);
    ws_write
        .send(Message::from(event_msg.to_string()))
        .await
        .map_err(|e| AppError::custom(format!("Failed to send deletion: {e}")))?;

    // Remove from pending_deletions if it was queued for offline
    if let Ok(conn) = crate::db::database_connection(app) {
        let _ = conn.execute(
            "DELETE FROM pending_deletions WHERE entity_id = ?1",
            params![entity_id],
        );
    }

    sync_log(app, &format!("pushed delete {entity_id}"));

    Ok(())
}

// ── Notebook push ──────────────────────────────────────────────────────

async fn push_notebook(
    app: &AppHandle,
    keys: &Keys,
    ws_write: &mut futures_util::stream::SplitSink<
        tokio_tungstenite::WebSocketStream<
            tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
        >,
        Message,
    >,
    notebook_id: &str,
    recent_pushes: &mut HashMap<String, std::time::Instant>,
) -> Result<(), AppError> {
    let (name, updated_at) = {
        let conn = crate::db::database_connection(app)?;
        let row: Option<(String, i64)> = conn
            .query_row(
                "SELECT name, updated_at FROM notebooks WHERE id = ?1",
                params![notebook_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()?;
        row.ok_or_else(|| AppError::custom(format!("Notebook not found: {notebook_id}")))?
    };

    let rumor = notebook_to_rumor(notebook_id, &name, updated_at, keys.public_key());

    let d_tag = gift_wrap_d_tag(keys.secret_key(), &format!("notebook:{notebook_id}"));
    let gift_wrap =
        crate::adapters::nostr::nip59_ext::gift_wrap(keys, &keys.public_key(), rumor, [Tag::identifier(&d_tag)])?;

    let event_id = gift_wrap.id.to_hex();
    recent_pushes.insert(event_id.clone(), std::time::Instant::now());

    let gift_wrap_json: serde_json::Value = serde_json::from_str(&gift_wrap.as_json())
        .map_err(|e| AppError::custom(format!("Failed to serialize gift wrap: {e}")))?;
    let event_msg = serde_json::json!(["EVENT", gift_wrap_json]);
    ws_write
        .send(Message::from(event_msg.to_string()))
        .await
        .map_err(|e| AppError::custom(format!("Failed to send event: {e}")))?;

    let conn = crate::db::database_connection(app)?;
    conn.execute(
        "UPDATE notebooks SET sync_event_id = ?1, locally_modified = 0 WHERE id = ?2",
        params![event_id, notebook_id],
    )?;

    sync_log(app, &format!("pushed notebook {notebook_id}"));

    Ok(())
}

// ── Blob sync ──────────────────────────────────────────────────────────

/// Download any attachment blobs referenced in the rumor that are missing locally.
async fn download_missing_blobs(
    app: &AppHandle,
    keys: &Keys,
    rumor: &UnsignedEvent,
    blossom_url: &str,
) {
    // Extract blob tags: ["blob", plaintext_hash, ciphertext_hash, encryption_key_hex]
    let blob_tags: Vec<(&str, &str, &str)> = rumor
        .tags
        .filter(TagKind::custom("blob"))
        .filter_map(|tag| {
            let s = tag.as_slice();
            if s.len() >= 4 {
                Some((s[1].as_str(), s[2].as_str(), s[3].as_str()))
            } else {
                None
            }
        })
        .collect();

    let http_client = reqwest::Client::new();
    let pubkey_hex = keys.public_key().to_hex();
    for (plaintext_hash, ciphertext_hash, key_hex) in &blob_tags {
        // Save blob metadata keyed to this server + identity for on-demand download
        if let Ok(conn) = crate::db::database_connection(app) {
            let _ = conn.execute(
                "INSERT OR REPLACE INTO blob_meta (plaintext_hash, server_url, pubkey, ciphertext_hash, encryption_key) VALUES (?1, ?2, ?3, ?4, ?5)",
                params![plaintext_hash, blossom_url, pubkey_hex, ciphertext_hash, key_hex],
            );
        }

        // Check if we already have it locally
        match crate::adapters::filesystem::attachments::has_local_blob(app, plaintext_hash) {
            Ok(true) => continue,
            Ok(false) => {}
            Err(e) => {
                log::error!(
                    "[sync] failed to check local blob {}: {e}",
                    &plaintext_hash[..8]
                );
                continue;
            }
        }

        // Download from Blossom
        let ciphertext_bytes =
            match crate::adapters::blossom::client::download_blob(&http_client, blossom_url, ciphertext_hash, keys)
                .await
            {
                Ok(data) => data,
                Err(e) => {
                    log::error!(
                        "[sync] failed to download blob {}: {e}",
                        &ciphertext_hash[..8]
                    );
                    continue;
                }
            };

        // Decrypt with ChaCha20-Poly1305
        let plaintext = match crate::adapters::blossom::client::decrypt_blob(&ciphertext_bytes, key_hex) {
            Ok(p) => p,
            Err(e) => {
                sync_log(app, &format!("failed to decrypt blob: {e}"));
                continue;
            }
        };

        // Determine extension from attachment references in the content, or detect from magic bytes
        let ext = extract_blob_extension(&rumor.content, plaintext_hash)
            .or_else(|| detect_image_extension(&plaintext))
            .unwrap_or_else(|| "bin".to_string());

        // Save locally
        if let Err(e) = crate::adapters::filesystem::attachments::save_blob(app, plaintext_hash, &ext, &plaintext) {
            log::error!("[sync] failed to save blob {}: {e}", &plaintext_hash[..8]);
        } else {
            log::info!("[sync] downloaded blob {}.{ext}", &plaintext_hash[..8]);
        }
    }
}

/// Detect image format from magic bytes.
fn detect_image_extension(data: &[u8]) -> Option<String> {
    if data.starts_with(&[0x89, 0x50, 0x4E, 0x47]) {
        Some("png".to_string())
    } else if data.starts_with(&[0xFF, 0xD8, 0xFF]) {
        Some("jpg".to_string())
    } else if data.starts_with(b"GIF8") {
        Some("gif".to_string())
    } else if data.starts_with(b"RIFF") && data.len() > 11 && &data[8..12] == b"WEBP" {
        Some("webp".to_string())
    } else if data.starts_with(b"<svg") || data.starts_with(b"<?xml") {
        Some("svg".to_string())
    } else {
        None
    }
}

/// Extract the file extension for a blob hash from markdown content.
pub(crate) fn extract_blob_extension(content: &str, hash: &str) -> Option<String> {
    let pattern = format!("attachment://{hash}.");
    if let Some(pos) = content.find(&pattern) {
        let after = &content[pos + pattern.len()..];
        let ext: String = after.chars().take_while(|c| c.is_alphanumeric()).collect();
        if !ext.is_empty() {
            return Some(ext);
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::delete_note_from_sync;
    use rusqlite::{params, Connection};

    #[test]
    fn sync_delete_removes_note_and_invalidates_cache() {
        let conn = Connection::open_in_memory().expect("open sqlite");
        conn.execute_batch(
            "CREATE TABLE notes (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                markdown TEXT NOT NULL
            );
            CREATE TABLE notes_fts (
                note_id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                markdown TEXT NOT NULL
            );",
        )
        .expect("create schema");
        conn.execute(
            "INSERT INTO notes (id, title, markdown) VALUES (?1, ?2, ?3)",
            params!["note-1", "Title", "Body"],
        )
        .expect("insert note");
        conn.execute(
            "INSERT INTO notes_fts (note_id, title, markdown) VALUES (?1, ?2, ?3)",
            params!["note-1", "Title", "Body"],
        )
        .expect("insert fts");

        let mut invalidated_note_id: Option<String> = None;
        delete_note_from_sync(&conn, "note-1", |note_id| {
            invalidated_note_id = Some(note_id.to_string());
        })
        .expect("delete note from sync");

        let notes_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM notes", [], |row| row.get(0))
            .expect("count notes");
        let fts_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM notes_fts", [], |row| row.get(0))
            .expect("count notes_fts");

        assert_eq!(notes_count, 0);
        assert_eq!(fts_count, 0);
        assert_eq!(invalidated_note_id.as_deref(), Some("note-1"));
    }
}

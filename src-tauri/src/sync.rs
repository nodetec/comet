use futures_util::{SinkExt, StreamExt};
use hmac::{Hmac, Mac};
use nostr_sdk::prelude::*;
use sha2::Sha256;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::{mpsc, watch, Mutex};
use tokio::task::JoinHandle;
use tokio_tungstenite::{connect_async, tungstenite::Message};

// ── Types ──────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum SyncState {
    Disconnected,
    Connecting,
    Authenticating,
    Syncing,
    Connected,
    Error { message: String },
}

#[derive(Debug)]
pub enum SyncCommand {
    PushNote(String),
    /// note_id, sync_event_id (pre-fetched before local delete)
    PushDeletion(String, String),
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncStatusPayload {
    pub state: SyncState,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncChangePayload {
    pub note_id: String,
    pub action: String, // "upsert" or "delete"
}

/// Note fields extracted from a synced event rumor.
pub struct SyncedNote {
    pub id: String,
    pub title: String,
    pub markdown: String,
    pub notebook_id: Option<String>,
    pub notebook_name: Option<String>,
    pub created_at: i64,
    pub modified_at: i64,
    pub archived_at: Option<i64>,
    pub pinned_at: Option<i64>,
    pub tags: Vec<String>,
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
    // Check if a sync relay is configured
    let has_relay = {
        let conn = match crate::db::database_connection(app) {
            Ok(c) => c,
            Err(_) => return,
        };
        get_sync_relay_url(&conn).is_some()
    };

    if has_relay {
        let manager = app.state::<SyncManager>();
        manager.start(app.clone()).await;
    }
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

fn get_sync_relay_url(conn: &Connection) -> Option<String> {
    conn.query_row(
        "SELECT url FROM relays WHERE kind = 'sync' LIMIT 1",
        [],
        |row| row.get(0),
    )
    .optional()
    .ok()
    .flatten()
}

fn get_identity(conn: &Connection) -> Option<(String, String)> {
    conn.query_row(
        "SELECT secret_key, public_key FROM nostr_identity LIMIT 1",
        [],
        |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
    )
    .optional()
    .ok()
    .flatten()
}

fn get_checkpoint(conn: &Connection) -> i64 {
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

use crate::nostr::strip_title_line;

/// Compute a deterministic d-tag for a gift wrap using HMAC-SHA256.
/// This allows the relay to replace old versions without leaking the note ID.
fn gift_wrap_d_tag(secret_key: &SecretKey, note_id: &str) -> String {
    let mut mac = Hmac::<Sha256>::new_from_slice(secret_key.as_secret_bytes())
        .expect("HMAC accepts any key size");
    mac.update(note_id.as_bytes());
    hex::encode(mac.finalize().into_bytes())
}

/// Extract attachment:// hashes from markdown content.
fn extract_attachment_hashes(markdown: &str) -> Vec<String> {
    static RE: std::sync::LazyLock<regex_lite::Regex> =
        std::sync::LazyLock::new(|| regex_lite::Regex::new(r"attachment://([a-f0-9]{64})\.\w+").unwrap());
    RE.captures_iter(markdown)
        .map(|cap| cap[1].to_string())
        .collect()
}

fn note_to_rumor(
    note_id: &str,
    title: &str,
    markdown: &str,
    modified_at: i64,
    created_at: i64,
    notebook_id: Option<&str>,
    notebook_name: Option<&str>,
    archived_at: Option<i64>,
    pinned_at: Option<i64>,
    tags: &[String],
    blob_tags: &[(String, String, String)], // (plaintext_hash, ciphertext_hash, encryption_key_hex)
    pubkey: PublicKey,
) -> UnsignedEvent {
    let content = strip_title_line(markdown);

    let mut event_tags: Vec<Tag> = vec![
        Tag::identifier(note_id),
        Tag::title(title),
        Tag::custom(TagKind::custom("published_at"), vec![modified_at.to_string()]),
        Tag::custom(TagKind::custom("created_at"), vec![created_at.to_string()]),
    ];

    if let (Some(nb_id), Some(nb_name)) = (notebook_id, notebook_name) {
        event_tags.push(Tag::custom(
            TagKind::custom("notebook"),
            vec![nb_id.to_string(), nb_name.to_string()],
        ));
    }

    if let Some(ts) = archived_at {
        event_tags.push(Tag::custom(TagKind::custom("archived_at"), vec![ts.to_string()]));
    }

    if let Some(ts) = pinned_at {
        event_tags.push(Tag::custom(TagKind::custom("pinned_at"), vec![ts.to_string()]));
    }

    for t in tags {
        event_tags.push(Tag::hashtag(t));
    }

    for (plaintext_hash, ciphertext_hash, key_hex) in blob_tags {
        event_tags.push(Tag::custom(
            TagKind::custom("blob"),
            vec![plaintext_hash.clone(), ciphertext_hash.clone(), key_hex.clone()],
        ));
    }

    EventBuilder::new(Kind::LongFormTextNote, content)
        .tags(event_tags)
        .build(pubkey)
}

fn rumor_to_synced_note(rumor: &UnsignedEvent) -> Result<SyncedNote, String> {
    let d_tag = rumor
        .tags
        .find(TagKind::d())
        .and_then(|t| t.content())
        .map(|s| s.to_string())
        .ok_or("Missing d tag in synced event")?;

    let title = rumor
        .tags
        .find(TagKind::Title)
        .and_then(|t| t.content())
        .map(|s| s.to_string())
        .unwrap_or_default();

    let modified_at = rumor
        .tags
        .find(TagKind::custom("published_at"))
        .and_then(|t| t.content())
        .and_then(|s| s.parse::<i64>().ok())
        .unwrap_or_else(|| rumor.created_at.as_secs() as i64 * 1000);

    let created_at = rumor
        .tags
        .find(TagKind::custom("created_at"))
        .and_then(|t| t.content())
        .and_then(|s| s.parse::<i64>().ok())
        .unwrap_or(modified_at);

    let notebook_tag = rumor.tags.find(TagKind::custom("notebook"));
    let (notebook_id, notebook_name) = match notebook_tag {
        Some(tag) => {
            let vals: Vec<&str> = tag.as_slice().iter().skip(1).map(|s| s.as_str()).collect();
            if vals.len() >= 2 {
                (Some(vals[0].to_string()), Some(vals[1].to_string()))
            } else {
                (None, None)
            }
        }
        None => (None, None),
    };

    let archived_at = rumor
        .tags
        .find(TagKind::custom("archived_at"))
        .and_then(|t| t.content())
        .and_then(|s| s.parse::<i64>().ok());

    let pinned_at = rumor
        .tags
        .find(TagKind::custom("pinned_at"))
        .and_then(|t| t.content())
        .and_then(|s| s.parse::<i64>().ok());

    let tags: Vec<String> = rumor
        .tags
        .filter(TagKind::t())
        .filter_map(|t: &Tag| t.content().map(|s| s.to_string()))
        .collect();

    // Reconstruct full markdown with title line
    let markdown = if title.is_empty() {
        rumor.content.clone()
    } else {
        format!("# {}\n\n{}", title, rumor.content)
    };

    Ok(SyncedNote {
        id: d_tag,
        title,
        markdown,
        notebook_id,
        notebook_name,
        created_at,
        modified_at,
        archived_at,
        pinned_at,
        tags,
    })
}

// ── Upsert from sync ───────────────────────────────────────────────────

fn upsert_from_sync(
    conn: &Connection,
    note: &SyncedNote,
    sync_event_id: &str,
) -> Result<Option<String>, String> {
    let existing: Option<(String, i64)> = conn
        .query_row(
            "SELECT id, modified_at FROM notes WHERE id = ?1",
            params![note.id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?;

    if let Some((_, local_modified)) = &existing {
        if *local_modified >= note.modified_at {
            // Local version is same or newer — just update sync_event_id
            conn.execute(
                "UPDATE notes SET sync_event_id = ?1 WHERE id = ?2",
                params![sync_event_id, note.id],
            )
            .map_err(|e| e.to_string())?;
            return Ok(None);
        }
    }

    // Ensure notebook exists if referenced
    if let (Some(nb_id), Some(nb_name)) = (&note.notebook_id, &note.notebook_name) {
        let now = now_ms();
        conn.execute(
            "INSERT OR IGNORE INTO notebooks (id, name, created_at, updated_at) VALUES (?1, ?2, ?3, ?3)",
            params![nb_id, nb_name, now],
        )
        .map_err(|e| e.to_string())?;
    }

    if existing.is_some() {
        // Update existing note
        conn.execute(
            "UPDATE notes SET title = ?1, markdown = ?2, notebook_id = ?3, modified_at = ?4, \
             archived_at = ?5, pinned_at = ?6, sync_event_id = ?7 WHERE id = ?8",
            params![
                note.title,
                note.markdown,
                note.notebook_id,
                note.modified_at,
                note.archived_at,
                note.pinned_at,
                sync_event_id,
                note.id,
            ],
        )
        .map_err(|e| e.to_string())?;
    } else {
        // Insert new note
        conn.execute(
            "INSERT INTO notes (id, title, markdown, notebook_id, created_at, modified_at, \
             archived_at, pinned_at, sync_event_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                note.id,
                note.title,
                note.markdown,
                note.notebook_id,
                note.created_at,
                note.modified_at,
                note.archived_at,
                note.pinned_at,
                sync_event_id,
            ],
        )
        .map_err(|e| e.to_string())?;
    }

    // Update tags
    conn.execute("DELETE FROM note_tags WHERE note_id = ?1", params![note.id])
        .map_err(|e| e.to_string())?;
    for tag in &note.tags {
        conn.execute(
            "INSERT OR IGNORE INTO note_tags (note_id, tag) VALUES (?1, ?2)",
            params![note.id, tag],
        )
        .map_err(|e| e.to_string())?;
    }

    // Update FTS
    conn.execute(
        "DELETE FROM notes_fts WHERE note_id = ?1",
        params![note.id],
    )
    .map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO notes_fts (note_id, title, markdown) VALUES (?1, ?2, ?3)",
        params![note.id, note.title, note.markdown],
    )
    .map_err(|e| e.to_string())?;

    Ok(Some(note.id.clone()))
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
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
        match run_sync_connection(&app, &state, &mut shutdown_rx, &mut push_rx).await {
            Ok(()) => break, // clean shutdown
            Err(e) => {
                log::error!("[sync] connection error: {e}");
                set_state(
                    &state,
                    SyncState::Error { message: e.clone() },
                    &app,
                )
                .await;

                // Backoff before reconnect
                tokio::select! {
                    _ = tokio::time::sleep(backoff) => {},
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
) -> Result<(), String> {
    // Read config from DB
    let (relay_url, secret_hex, _public_hex) = {
        let conn = crate::db::database_connection(app).map_err(|e| e.to_string())?;
        let relay_url =
            get_sync_relay_url(&conn).ok_or("No sync relay configured".to_string())?;
        let (secret_hex, public_hex) =
            get_identity(&conn).ok_or("No Nostr identity configured".to_string())?;
        (relay_url, secret_hex, public_hex)
    };

    let secret_key =
        SecretKey::parse(&secret_hex).map_err(|e| format!("Invalid secret key: {e}"))?;
    let keys = Keys::new(secret_key);
    let pubkey = keys.public_key();

    // Connect WebSocket
    set_state(state, SyncState::Connecting, app).await;

    let (ws_stream, _) = connect_async(&relay_url)
        .await
        .map_err(|e| format!("WebSocket connection failed: {e}"))?;

    let (mut ws_write, mut ws_read) = ws_stream.split();

    // Wait for AUTH challenge
    set_state(state, SyncState::Authenticating, app).await;

    let challenge = loop {
        tokio::select! {
            msg = ws_read.next() => {
                match msg {
                    Some(Ok(Message::Text(ref text))) => {
                        let parsed: serde_json::Value = serde_json::from_str(text.as_ref())
                            .map_err(|e| format!("Invalid JSON from relay: {e}"))?;
                        if let Some(arr) = parsed.as_array() {
                            if arr.first().and_then(|v| v.as_str()) == Some("AUTH") {
                                if let Some(c) = arr.get(1).and_then(|v| v.as_str()) {
                                    break c.to_string();
                                }
                            }
                        }
                    }
                    Some(Err(e)) => return Err(format!("WebSocket error: {e}")),
                    None => return Err("Connection closed before AUTH".to_string()),
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
        .map_err(|e| format!("Failed to sign AUTH event: {e}"))?;

    let auth_json: serde_json::Value = serde_json::from_str(&auth_event.as_json())
        .map_err(|e| format!("Failed to serialize AUTH event: {e}"))?;
    let auth_msg = serde_json::json!(["AUTH", auth_json]);
    ws_write
        .send(Message::from(auth_msg.to_string()))
        .await
        .map_err(|e| format!("Failed to send AUTH: {e}"))?;

    // Wait for OK
    let ok = wait_for_ok(&mut ws_read, shutdown_rx).await?;
    if !ok {
        return Err("AUTH rejected by relay".to_string());
    }

    // Read checkpoint and subscribe to CHANGES
    set_state(state, SyncState::Syncing, app).await;

    let checkpoint = {
        let conn = crate::db::database_connection(app).map_err(|e| e.to_string())?;
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
        .map_err(|e| format!("Failed to send CHANGES: {e}"))?;

    // Track recently pushed event IDs to avoid echo
    let mut recent_pushes: HashMap<String, std::time::Instant> = HashMap::new();

    // Debounce timers for push commands
    let mut pending_pushes: HashMap<String, tokio::time::Instant> = HashMap::new();
    let debounce_duration = Duration::from_secs(2);

    // Main select loop
    loop {
        // Fire any ready debounced pushes before waiting for new events
        let now = tokio::time::Instant::now();
        let ready: Vec<String> = pending_pushes
            .iter()
            .filter(|(_, deadline)| **deadline <= now)
            .map(|(id, _)| id.clone())
            .collect();
        for note_id in &ready {
            pending_pushes.remove(note_id);
            if let Err(e) = push_note(app, &keys, &mut ws_write, note_id, &mut recent_pushes).await {
                eprintln!("[sync] push error for {note_id}: {e}");
            }
        }

        // Compute sleep duration for the next pending push
        let debounce_sleep = match pending_pushes.values().min().copied() {
            Some(deadline) => tokio::time::sleep_until(deadline),
            None => tokio::time::sleep(Duration::from_secs(86400)), // park if nothing pending
        };
        tokio::pin!(debounce_sleep);

        tokio::select! {
            _ = &mut debounce_sleep => {
                // Loop will fire ready pushes at the top
            }

            msg = ws_read.next() => {
                match msg {
                    Some(Ok(Message::Text(ref text))) => {
                        process_relay_message(
                            app, &keys, text.as_ref(), state,
                            &mut recent_pushes,
                        ).await?;
                    }
                    Some(Ok(Message::Close(_))) | None => {
                        return Err("Connection closed by relay".to_string());
                    }
                    Some(Err(e)) => return Err(format!("WebSocket error: {e}")),
                    _ => {}
                }
            }

            cmd = push_rx.recv() => {
                match cmd {
                    Some(SyncCommand::PushNote(note_id)) => {
                        // Debounce: reset timer for this note
                        pending_pushes.insert(
                            note_id,
                            tokio::time::Instant::now() + debounce_duration,
                        );
                    }
                    Some(SyncCommand::PushDeletion(note_id, sync_event_id)) => {
                        push_deletion(app, &keys, &mut ws_write, &note_id, &sync_event_id).await?;
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
) -> Result<bool, String> {
    loop {
        tokio::select! {
            msg = ws_read.next() => {
                match msg {
                    Some(Ok(Message::Text(ref text))) => {
                        let parsed: serde_json::Value = serde_json::from_str(text.as_ref())
                            .map_err(|e| format!("Invalid JSON: {e}"))?;
                        if let Some(arr) = parsed.as_array() {
                            if arr.first().and_then(|v| v.as_str()) == Some("OK") {
                                return Ok(arr.get(2).and_then(|v| v.as_bool()).unwrap_or(false));
                            }
                        }
                    }
                    Some(Err(e)) => return Err(format!("WebSocket error: {e}")),
                    None => return Err("Connection closed".to_string()),
                    _ => {}
                }
            }
            _ = shutdown_rx.changed() => return Err("Shutdown".to_string()),
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
) -> Result<(), String> {
    let parsed: serde_json::Value =
        serde_json::from_str(text).map_err(|e| format!("Invalid JSON: {e}"))?;

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
            let seq = arr.get(3).and_then(|v| v.as_i64()).unwrap_or(0);
            let event_json = arr.get(4).ok_or("Missing event in CHANGES EVENT")?;

            let event: Event = Event::from_json(event_json.to_string())
                .map_err(|e| format!("Invalid event: {e}"))?;

            let event_id = event.id.to_hex();

            // Skip echo (events we just pushed)
            if recent_pushes.contains_key(&event_id) {
                // Still update checkpoint
                let conn = crate::db::database_connection(app).map_err(|e| e.to_string())?;
                save_checkpoint(&conn, seq);
                return Ok(());
            }

            // Unwrap gift wrap (skip events we can't decrypt, e.g. from a previous key)
            let unwrapped = match nip59::extract_rumor(keys, &event).await {
                Ok(u) => u,
                Err(e) => {
                    eprintln!("[sync] skipping undecryptable event {}: {e}", &event_id[..8]);
                    let conn = crate::db::database_connection(app).map_err(|e| e.to_string())?;
                    save_checkpoint(&conn, seq);
                    return Ok(());
                }
            };

            let synced_note = match rumor_to_synced_note(&unwrapped.rumor) {
                Ok(n) => n,
                Err(e) => {
                    eprintln!("[sync] skipping malformed rumor {}: {e}", &event_id[..8]);
                    let conn = crate::db::database_connection(app).map_err(|e| e.to_string())?;
                    save_checkpoint(&conn, seq);
                    return Ok(());
                }
            };
            let note_id = synced_note.id.clone();

            // Upsert into local DB
            let conn = crate::db::database_connection(app).map_err(|e| e.to_string())?;
            let updated = upsert_from_sync(&conn, &synced_note, &event_id)?;
            save_checkpoint(&conn, seq);

            // Download missing attachment blobs from Blossom
            if updated.is_some() {
                let blossom_url = get_blossom_url(&conn);
                if let Some(blossom_url) = blossom_url {
                    download_missing_blobs(app, keys, &unwrapped.rumor, &blossom_url).await;
                }
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
        "DELETED" => {
            let seq = arr.get(3).and_then(|v| v.as_i64()).unwrap_or(0);
            let deleted_event_id = arr.get(4).and_then(|v| v.as_str()).unwrap_or("");

            // Find note by sync_event_id
            let conn = crate::db::database_connection(app).map_err(|e| e.to_string())?;
            let note_id: Option<String> = conn
                .query_row(
                    "SELECT id FROM notes WHERE sync_event_id = ?1",
                    params![deleted_event_id],
                    |row| row.get(0),
                )
                .optional()
                .map_err(|e| e.to_string())?;

            if let Some(note_id) = note_id {
                // Archive the note (soft-delete for safety)
                let now = now_ms();
                conn.execute(
                    "UPDATE notes SET archived_at = ?1 WHERE id = ?2 AND archived_at IS NULL",
                    params![now, note_id],
                )
                .map_err(|e| e.to_string())?;

                let _ = app.emit(
                    "sync-remote-change",
                    SyncChangePayload {
                        note_id,
                        action: "delete".to_string(),
                    },
                );
            }

            save_checkpoint(&conn, seq);
        }
        "EOSE" => {
            let max_seq = arr.get(3).and_then(|v| v.as_i64()).unwrap_or(0);
            let conn = crate::db::database_connection(app).map_err(|e| e.to_string())?;
            save_checkpoint(&conn, max_seq);
            set_state(state, SyncState::Connected, app).await;
        }
        "ERR" => {
            let message = arr.get(3).and_then(|v| v.as_str()).unwrap_or("unknown error");
            return Err(format!("CHANGES error: {message}"));
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
) -> Result<(), String> {
    // Read note from DB
    let (title, markdown, notebook_id, notebook_name, created_at, modified_at, archived_at, pinned_at, tags, blossom_url) = {
        let conn = crate::db::database_connection(app).map_err(|e| e.to_string())?;

        let note: Option<(String, String, Option<String>, i64, i64, Option<i64>, Option<i64>)> = conn
            .query_row(
                "SELECT title, markdown, notebook_id, created_at, modified_at, archived_at, pinned_at FROM notes WHERE id = ?1",
                params![note_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?, row.get(6)?)),
            )
            .optional()
            .map_err(|e| e.to_string())?;

        let (title, markdown, notebook_id, created_at, modified_at, archived_at, pinned_at) =
            note.ok_or_else(|| format!("Note not found: {note_id}"))?;

        // Get notebook name if applicable
        let notebook_name: Option<String> = match &notebook_id {
            Some(nb_id) => conn
                .query_row("SELECT name FROM notebooks WHERE id = ?1", params![nb_id], |row| row.get(0))
                .optional()
                .map_err(|e| e.to_string())?,
            None => None,
        };

        // Get tags
        let mut tag_stmt = conn
            .prepare("SELECT tag FROM note_tags WHERE note_id = ?1")
            .map_err(|e| e.to_string())?;
        let tags: Vec<String> = tag_stmt
            .query_map(params![note_id], |row| row.get(0))
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;

        let blossom_url = get_blossom_url(&conn);

        (title, markdown, notebook_id, notebook_name, created_at, modified_at, archived_at, pinned_at, tags, blossom_url)
    };

    // Upload attachment blobs to Blossom if configured
    let mut blob_tags: Vec<(String, String, String)> = Vec::new();
    let attachment_hashes = extract_attachment_hashes(&markdown);
    if let Some(ref blossom_url) = blossom_url {
        let http_client = reqwest::Client::new();
        for hash in &attachment_hashes {
            // Read the local blob
            let blob_data = match crate::attachments::read_blob(app, hash)? {
                Some((data, _ext)) => data,
                None => continue,
            };

            // Encrypt with ChaCha20-Poly1305 (NIP-44 has a 65KB size limit)
            let (ciphertext_bytes, key_hex) = crate::blossom::encrypt_blob(&blob_data)?;

            // Upload to Blossom
            let ciphertext_hash = crate::blossom::upload_blob(
                &http_client,
                blossom_url,
                ciphertext_bytes,
                keys,
            )
            .await?;

            // Save blob metadata for on-demand download on other devices
            let conn = crate::db::database_connection(app).map_err(|e| e.to_string())?;
            conn.execute(
                "INSERT OR REPLACE INTO blob_meta (plaintext_hash, ciphertext_hash, encryption_key) VALUES (?1, ?2, ?3)",
                params![hash, ciphertext_hash, key_hex],
            ).map_err(|e| e.to_string())?;

            blob_tags.push((hash.clone(), ciphertext_hash, key_hex));
        }
    }

    // Build rumor
    let rumor = note_to_rumor(
        note_id,
        &title,
        &markdown,
        modified_at,
        created_at,
        notebook_id.as_deref(),
        notebook_name.as_deref(),
        archived_at,
        pinned_at,
        &tags,
        &blob_tags,
        keys.public_key(),
    );

    // Gift wrap to self with HMAC'd d-tag for relay-side replacement
    let d_tag = gift_wrap_d_tag(keys.secret_key(), note_id);
    let gift_wrap = EventBuilder::gift_wrap(
        keys,
        &keys.public_key(),
        rumor,
        [Tag::identifier(&d_tag)],
    )
    .await
    .map_err(|e| format!("Failed to gift wrap: {e}"))?;

    let event_id = gift_wrap.id.to_hex();

    // Track as recently pushed (for echo prevention)
    recent_pushes.insert(event_id.clone(), std::time::Instant::now());

    // Send to relay
    let gift_wrap_json: serde_json::Value = serde_json::from_str(&gift_wrap.as_json())
        .map_err(|e| format!("Failed to serialize gift wrap: {e}"))?;
    let event_msg = serde_json::json!(["EVENT", gift_wrap_json]);
    ws_write
        .send(Message::from(event_msg.to_string()))
        .await
        .map_err(|e| format!("Failed to send event: {e}"))?;

    // Update sync_event_id in DB
    let conn = crate::db::database_connection(app).map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE notes SET sync_event_id = ?1 WHERE id = ?2",
        params![event_id, note_id],
    )
    .map_err(|e| e.to_string())?;

    log::info!("[sync] pushed note {note_id} as event {}", &event_id[..8]);

    Ok(())
}

async fn push_deletion(
    _app: &AppHandle,
    keys: &Keys,
    ws_write: &mut futures_util::stream::SplitSink<
        tokio_tungstenite::WebSocketStream<
            tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
        >,
        Message,
    >,
    note_id: &str,
    sync_event_id: &str,
) -> Result<(), String> {
    let event_id = EventId::parse(sync_event_id)
        .map_err(|e| format!("Invalid sync event ID: {e}"))?;

    let deletion = EventBuilder::delete(
        EventDeletionRequest::new().id(event_id)
    )
    .sign_with_keys(keys)
    .map_err(|e| format!("Failed to sign deletion: {e}"))?;

    let deletion_json: serde_json::Value = serde_json::from_str(&deletion.as_json())
        .map_err(|e| format!("Failed to serialize deletion: {e}"))?;
    let del_msg = serde_json::json!(["EVENT", deletion_json]);
    ws_write
        .send(Message::from(del_msg.to_string()))
        .await
        .map_err(|e| format!("Failed to send deletion: {e}"))?;

    log::info!("[sync] pushed deletion for note {note_id}");

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

    for (plaintext_hash, ciphertext_hash, key_hex) in &blob_tags {
        // Save blob metadata for on-demand download
        if let Ok(conn) = crate::db::database_connection(app) {
            let _ = conn.execute(
                "INSERT OR REPLACE INTO blob_meta (plaintext_hash, ciphertext_hash, encryption_key) VALUES (?1, ?2, ?3)",
                params![plaintext_hash, ciphertext_hash, key_hex],
            );
        }

        // Check if we already have it locally
        match crate::attachments::has_local_blob(app, plaintext_hash) {
            Ok(true) => continue,
            Ok(false) => {}
            Err(e) => {
                log::error!("[sync] failed to check local blob {}: {e}", &plaintext_hash[..8]);
                continue;
            }
        }

        // Download from Blossom
        let http_client = reqwest::Client::new();
        let ciphertext_bytes = match crate::blossom::download_blob(&http_client, blossom_url, ciphertext_hash, keys).await {
            Ok(data) => data,
            Err(e) => {
                log::error!("[sync] failed to download blob {}: {e}", &ciphertext_hash[..8]);
                continue;
            }
        };

        // Decrypt with ChaCha20-Poly1305
        let plaintext = match crate::blossom::decrypt_blob(&ciphertext_bytes, key_hex) {
            Ok(p) => p,
            Err(e) => {
                eprintln!("[sync] failed to decrypt blob: {e}");
                continue;
            }
        };

        // Determine extension from attachment references in the content
        let ext = extract_blob_extension(&rumor.content, plaintext_hash).unwrap_or("bin".to_string());

        // Save locally
        if let Err(e) = crate::attachments::save_blob(app, plaintext_hash, &ext, &plaintext) {
            log::error!("[sync] failed to save blob {}: {e}", &plaintext_hash[..8]);
        } else {
            log::info!("[sync] downloaded blob {}.{ext}", &plaintext_hash[..8]);
        }
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

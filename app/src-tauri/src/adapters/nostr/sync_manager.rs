use crate::adapters::sqlite::sync_repository::get_sync_relay_url;
use crate::domain::sync::model::{SyncCommand, SyncState, SyncStatusPayload};
use crate::error::AppError;
use rusqlite::OptionalExtension;
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::{mpsc, watch, Mutex};
use tokio::task::JoinHandle;

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
        let uses_keychain_storage =
            crate::adapters::sqlite::identity_repository::get_nsec_storage(&conn)?.as_deref()
                == Some(crate::adapters::sqlite::identity_repository::NSEC_STORAGE_KEYCHAIN);
        let needs_unlock = has_relay
            && enabled
            && uses_keychain_storage
            && !crate::adapters::tauri::key_store::is_current_identity_unlocked(app, &conn)?;
        (has_relay, enabled, needs_unlock)
    };

    let manager = app.state::<SyncManager>();
    let (has_relay, enabled, needs_unlock) = readiness;

    if !has_relay || !enabled {
        manager.stop().await;
        return Ok(());
    }

    if needs_unlock {
        manager.stop().await;
        set_state(&manager.state, SyncState::NeedsUnlock, app).await;
        sync_log(
            app,
            "sync paused until the keychain-backed account is unlocked",
        );
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
    if {
        let conn = crate::db::database_connection(app)?;
        get_sync_relay_url(&conn).is_none()
    } {
        return Err(AppError::custom("No sync relay configured"));
    }

    super::snapshot_sync_connection::run_snapshot_sync_connection(app, state, shutdown_rx, push_rx)
        .await
}

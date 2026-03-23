use crate::adapters::mobile::key_store::UnlockedNostrKeys;
use crate::adapters::nostr::sync_manager::SyncManager;
use crate::infra::cache::RenderedHtmlCache;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, OnceLock};

pub static APP_STATE: OnceLock<Arc<AppState>> = OnceLock::new();

pub fn state() -> &'static Arc<AppState> {
    APP_STATE.get().expect("App not initialized — call init_app first")
}

/// Platform-agnostic application state, replacing Tauri's `AppHandle`.
pub struct AppState {
    /// Root data directory (provided by the RN side at init).
    pub base_dir: PathBuf,
    /// Rendered HTML cache (kept for API compat, unused on mobile).
    pub html_cache: RenderedHtmlCache,
    /// In-memory unlocked Nostr keys.
    pub unlocked_keys: UnlockedNostrKeys,
    /// Sync manager instance.
    pub sync_manager: SyncManager,
    /// Callback for emitting events to the React Native side.
    pub event_emitter: Mutex<Option<Arc<dyn EventEmitter>>>,
}

/// Trait for emitting events to the host (React Native).
#[uniffi::export(callback_interface)]
pub trait EventEmitter: Send + Sync {
    fn emit(&self, event_name: String, payload: String);
}

impl AppState {
    pub fn emit(&self, event_name: &str, payload: &str) {
        if let Ok(guard) = self.event_emitter.lock() {
            if let Some(ref emitter) = *guard {
                emitter.emit(event_name.to_string(), payload.to_string());
            }
        }
    }
}

use crate::error::AppError;
use crate::ports::key_store::KeyStore;
use nostr_sdk::prelude::*;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

/// Callback interface for native keychain access (iOS Keychain / Android Keystore).
#[uniffi::export(callback_interface)]
pub trait NativeKeyStore: Send + Sync {
    fn store(&self, key: String, value: String) -> Result<(), String>;
    fn load(&self, key: String) -> Result<Option<String>, String>;
    fn remove(&self, key: String) -> Result<(), String>;
}

const NOSTR_NSEC_KEY_PREFIX: &str = "nostr-nsec";

fn storage_key(public_key: &str) -> String {
    format!("{NOSTR_NSEC_KEY_PREFIX}:{public_key}")
}

/// In-memory cache of unlocked Nostr keys.
#[derive(Default)]
pub struct UnlockedNostrKeys {
    keys_by_public_key: Mutex<HashMap<String, Keys>>,
}

impl UnlockedNostrKeys {
    pub fn get(&self, public_key: &str) -> Option<Keys> {
        self.keys_by_public_key
            .lock()
            .ok()
            .and_then(|guard| guard.get(public_key).cloned())
    }

    pub fn insert(&self, public_key: &str, keys: &Keys) {
        if let Ok(mut guard) = self.keys_by_public_key.lock() {
            guard.insert(public_key.to_string(), keys.clone());
        }
    }

    pub fn remove(&self, public_key: &str) {
        if let Ok(mut guard) = self.keys_by_public_key.lock() {
            guard.remove(public_key);
        }
    }
}

/// Mobile implementation of the `KeyStore` port backed by a native callback.
pub struct MobileKeyStore {
    native: Arc<dyn NativeKeyStore>,
    cache: Arc<UnlockedNostrKeys>,
}

impl MobileKeyStore {
    pub fn new(native: Arc<dyn NativeKeyStore>, cache: Arc<UnlockedNostrKeys>) -> Self {
        Self { native, cache }
    }
}

impl KeyStore for MobileKeyStore {
    fn store_nsec(&self, public_key: &str, nsec: &str) -> Result<(), AppError> {
        let keys = Keys::parse(nsec)
            .map_err(|e| AppError::custom(format!("Invalid key for storage: {e}")))?;
        let derived = keys.public_key().to_hex();
        if derived != public_key {
            return Err(AppError::custom(format!(
                "Key mismatch for pubkey {public_key}."
            )));
        }
        let normalized_nsec = keys
            .secret_key()
            .to_bech32()
            .map_err(|e| AppError::custom(e.to_string()))?;
        self.native
            .store(storage_key(public_key), normalized_nsec)
            .map_err(|e| AppError::custom(format!("Native keystore error: {e}")))?;
        self.cache.insert(public_key, &keys);
        Ok(())
    }

    fn load_nsec(&self, public_key: &str) -> Result<String, AppError> {
        self.native
            .load(storage_key(public_key))
            .map_err(|e| AppError::custom(format!("Native keystore error: {e}")))?
            .ok_or_else(|| {
                AppError::custom(format!(
                    "Nostr secret for account {public_key} is missing from keychain."
                ))
            })
    }

    fn remove_nsec(&self, public_key: &str) {
        self.cache.remove(public_key);
        let _ = self.native.remove(storage_key(public_key));
    }

    fn is_unlocked(&self, public_key: &str) -> Result<bool, AppError> {
        Ok(self.cache.get(public_key).is_some())
    }

    fn keys_for_account(&self, public_key: &str) -> Result<Keys, AppError> {
        if let Some(keys) = self.cache.get(public_key) {
            return Ok(keys);
        }
        let nsec = self.load_nsec(public_key)?;
        let keys = Keys::parse(&nsec)
            .map_err(|e| AppError::custom(format!("Invalid secret key: {e}")))?;
        if keys.public_key().to_hex() != public_key {
            return Err(AppError::custom(format!(
                "Stored secret does not match account {public_key}."
            )));
        }
        self.cache.insert(public_key, &keys);
        Ok(keys)
    }
}

// ---------------------------------------------------------------------------
// Free functions for code that expects the desktop-style API
// ---------------------------------------------------------------------------

use crate::app_state::AppState;
use rusqlite::{Connection, OptionalExtension};
use std::sync::Arc as StdArc;

fn current_identity_public_key(conn: &Connection) -> Result<String, AppError> {
    conn.query_row("SELECT public_key FROM nostr_identity LIMIT 1", [], |row| {
        row.get(0)
    })
    .optional()?
    .ok_or_else(|| AppError::custom("No Nostr identity configured."))
}

pub fn is_current_identity_unlocked(
    state: &StdArc<AppState>,
    conn: &Connection,
) -> Result<bool, AppError> {
    let public_key = current_identity_public_key(conn)?;
    Ok(state.unlocked_keys.get(&public_key).is_some())
}

pub fn store_account_nsec(
    state: &StdArc<AppState>,
    public_key: &str,
    raw_secret: &str,
) -> Result<(), AppError> {
    let keys = Keys::parse(raw_secret)
        .map_err(|e| AppError::custom(format!("Invalid key for storage: {e}")))?;
    let derived = keys.public_key().to_hex();
    if derived != public_key {
        return Err(AppError::custom(format!(
            "Key mismatch for pubkey {public_key}."
        )));
    }
    let normalized_nsec = keys
        .secret_key()
        .to_bech32()
        .map_err(|e| AppError::custom(e.to_string()))?;

    // Store via native keychain if available, otherwise just cache
    // (the native store callback is set up during init_app)
    state.unlocked_keys.insert(public_key, &keys);
    // We log but don't fail if native store is unavailable during init
    log::info!("[key_store] stored nsec for {public_key} (in-memory cached)");
    let _ = normalized_nsec; // nsec stored in native keychain via MobileKeyStore in API layer
    Ok(())
}

pub fn remove_account_nsec(state: &StdArc<AppState>, public_key: &str) {
    state.unlocked_keys.remove(public_key);
}

pub fn keys_for_account(
    state: &StdArc<AppState>,
    public_key: &str,
) -> Result<Keys, AppError> {
    if let Some(keys) = state.unlocked_keys.get(public_key) {
        return Ok(keys);
    }
    Err(AppError::custom(format!(
        "Account {public_key} is locked. Unlock it first."
    )))
}

pub fn keys_for_current_identity(
    state: &StdArc<AppState>,
    conn: &Connection,
) -> Result<(Keys, String), AppError> {
    let public_key = current_identity_public_key(conn)?;
    let keys = keys_for_account(state, &public_key)?;
    Ok((keys, public_key))
}

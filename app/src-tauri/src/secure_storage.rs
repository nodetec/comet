use crate::error::AppError;
use nostr_sdk::prelude::*;
use rusqlite::{Connection, OptionalExtension};
use std::{collections::HashMap, sync::Mutex};
use tauri::{AppHandle, Manager};
use tauri_plugin_secure_storage::{OptionsRequest, SecureStorageExt};

const NOSTR_NSEC_KEY_PREFIX: &str = "nostr-nsec";

#[derive(Default)]
pub struct UnlockedNostrKeys {
    keys_by_public_key: Mutex<HashMap<String, Keys>>,
}

fn storage_key(public_key: &str) -> String {
    format!("{NOSTR_NSEC_KEY_PREFIX}:{public_key}")
}

fn request(public_key: &str, data: Option<String>) -> OptionsRequest {
    OptionsRequest {
        prefixed_key: Some(storage_key(public_key)),
        data,
        sync: None,
        keychain_access: None,
    }
}

fn plugin_error(message: impl Into<String>) -> AppError {
    AppError::custom(format!("Secure storage error: {}", message.into()))
}

fn current_identity_public_key(conn: &Connection) -> Result<String, AppError> {
    conn.query_row("SELECT public_key FROM nostr_identity LIMIT 1", [], |row| {
        row.get(0)
    })
    .optional()?
    .ok_or_else(|| AppError::custom("No Nostr identity configured."))
}

fn cache_state(app: &AppHandle) -> tauri::State<'_, UnlockedNostrKeys> {
    app.state::<UnlockedNostrKeys>()
}

fn cached_keys_for_account(app: &AppHandle, public_key: &str) -> Result<Option<Keys>, AppError> {
    let cache = cache_state(app);
    let guard = cache
        .keys_by_public_key
        .lock()
        .map_err(|_| AppError::custom("Failed to access unlocked key cache."))?;
    Ok(guard.get(public_key).cloned())
}

fn cache_account_keys(app: &AppHandle, public_key: &str, keys: &Keys) -> Result<(), AppError> {
    let cache = cache_state(app);
    let mut guard = cache
        .keys_by_public_key
        .lock()
        .map_err(|_| AppError::custom("Failed to update unlocked key cache."))?;
    guard.insert(public_key.to_string(), keys.clone());
    Ok(())
}

pub(crate) fn is_current_identity_unlocked(
    app: &AppHandle,
    conn: &Connection,
) -> Result<bool, AppError> {
    let public_key = current_identity_public_key(conn)?;
    Ok(cached_keys_for_account(app, &public_key)?.is_some())
}

pub(crate) fn store_account_nsec(
    app: &AppHandle,
    public_key: &str,
    raw_secret: &str,
) -> Result<(), AppError> {
    let keys = Keys::parse(raw_secret)
        .map_err(|e| AppError::custom(format!("Invalid key for secure storage: {e}")))?;
    let derived_public_key = keys.public_key().to_hex();
    if derived_public_key != public_key {
        return Err(AppError::custom(format!(
            "Secure storage key mismatch for pubkey {public_key}."
        )));
    }

    let normalized_nsec = keys
        .secret_key()
        .to_bech32()
        .map_err(|e| AppError::custom(e.to_string()))?;

    app.secure_storage()
        .set_item(app.clone(), request(public_key, Some(normalized_nsec)))
        .map_err(|e| plugin_error(e.to_string()))?;

    cache_account_keys(app, public_key, &keys)?;
    Ok(())
}

pub(crate) fn remove_account_nsec(app: &AppHandle, public_key: &str) {
    if let Ok(mut guard) = cache_state(app).keys_by_public_key.lock() {
        guard.remove(public_key);
    }
    let _ = app
        .secure_storage()
        .remove_item(app.clone(), request(public_key, None));
}

pub(crate) fn load_account_nsec(app: &AppHandle, public_key: &str) -> Result<String, AppError> {
    let response = app
        .secure_storage()
        .get_item(app.clone(), request(public_key, None))
        .map_err(|e| plugin_error(e.to_string()))?;

    response.data.ok_or_else(|| {
        AppError::custom(format!(
            "Nostr secret for account {public_key} is missing from secure storage."
        ))
    })
}

pub(crate) fn keys_for_account(app: &AppHandle, public_key: &str) -> Result<Keys, AppError> {
    if let Some(keys) = cached_keys_for_account(app, public_key)? {
        return Ok(keys);
    }

    let nsec = load_account_nsec(app, public_key)?;
    let keys =
        Keys::parse(&nsec).map_err(|e| AppError::custom(format!("Invalid secret key: {e}")))?;

    if keys.public_key().to_hex() != public_key {
        return Err(AppError::custom(format!(
            "Secure storage secret does not match account {public_key}."
        )));
    }

    cache_account_keys(app, public_key, &keys)?;
    Ok(keys)
}

pub(crate) fn keys_for_current_identity(
    app: &AppHandle,
    conn: &Connection,
) -> Result<(Keys, String), AppError> {
    let public_key = current_identity_public_key(conn)?;
    let keys = keys_for_account(app, &public_key)?;
    Ok((keys, public_key))
}

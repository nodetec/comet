use crate::adapters::sqlite::sync_repository::get_blossom_url;
use crate::domain::blob::service::extract_attachment_hashes;
use crate::domain::sync::event_codec::{
    deleted_note_rumor, deleted_notebook_rumor, note_to_rumor, notebook_to_rumor,
};
use crate::error::AppError;
use futures_util::SinkExt;
use hmac::{Hmac, Mac};
use nostr_sdk::prelude::*;
use rusqlite::{params, OptionalExtension};
use sha2::Sha256;
use std::collections::HashMap;
use crate::app_state::AppState;
use std::sync::Arc;
use tokio_tungstenite::tungstenite::Message;

use super::sync_manager::sync_log;

/// Compute a deterministic d-tag for a gift wrap using HMAC-SHA256.
/// This allows the relay to replace old versions without leaking the note ID.
pub(super) fn gift_wrap_d_tag(secret_key: &SecretKey, note_id: &str) -> String {
    let mut mac = Hmac::<Sha256>::new_from_slice(secret_key.as_secret_bytes())
        .expect("HMAC accepts any key size");
    mac.update(note_id.as_bytes());
    hex::encode(mac.finalize().into_bytes())
}

pub(super) async fn push_note(
    app: &Arc<AppState>,
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
                params![ciphertext_hash, blossom_url, blob_data.len() as i64, crate::domain::common::time::now_millis()],
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

pub(super) async fn push_deletion(
    app: &Arc<AppState>,
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

pub(super) async fn push_notebook(
    app: &Arc<AppState>,
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

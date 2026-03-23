use crate::adapters::sqlite::sync_repository::{get_blossom_url, save_checkpoint};
use crate::domain::blob::service::{
    cleanup_orphaned_blobs, detect_image_extension, extract_blob_extension,
    find_orphaned_blob_hashes,
};
use crate::domain::sync::event_codec::{
    is_deleted_rumor, is_notebook_rumor, rumor_to_synced_note, rumor_to_synced_notebook,
};
use crate::domain::sync::model::{SyncChangePayload, SyncCommand, SyncState};
use crate::domain::sync::service::{
    delete_note_from_sync, upsert_from_sync, upsert_notebook_from_sync,
};
use crate::error::AppError;
use futures_util::StreamExt;
use nostr_sdk::prelude::*;
use rusqlite::params;
use std::collections::HashMap;
use crate::app_state::AppState;
use std::sync::Arc;
use tokio::sync::{watch, Mutex};
use tokio_tungstenite::tungstenite::Message;

use super::sync_manager::{set_state, sync_log};

pub(super) async fn wait_for_ok(
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

pub(super) async fn process_relay_message(
    app: &Arc<AppState>,
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
                        app.html_cache.invalidate(note_id);
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
                    &serde_json::to_string(&SyncChangePayload {
                        note_id: entity_id,
                        action: "delete".to_string(),
                    }).unwrap_or_default(),
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
                    &serde_json::to_string(&SyncChangePayload {
                        note_id: notebook.id,
                        action: "upsert".to_string(),
                    }).unwrap_or_default(),
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
                        &serde_json::to_string(&SyncChangePayload {
                            note_id,
                            action: "upsert".to_string(),
                        }).unwrap_or_default(),
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

            let manager = &app.sync_manager;
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

/// Download any attachment blobs referenced in the rumor that are missing locally.
pub(super) async fn download_missing_blobs(
    app: &Arc<AppState>,
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

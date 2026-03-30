use crate::adapters::nostr::relay_client::{RevisionRelayConnection, RevisionRelayIncomingMessage};
use crate::adapters::sqlite::sync_repository::get_blossom_url;
use crate::db::database_connection;
use crate::domain::blob::service::extract_attachment_hashes;
use crate::domain::sync::revision_service::{
    build_materialized_note_revision_for_publish, build_pending_note_deletion_revision,
    build_pending_note_revision, persist_local_deletion_revision, persist_local_note_revision,
};
use crate::error::AppError;
use nostr_sdk::prelude::*;
use rusqlite::{params, OptionalExtension};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use tauri::AppHandle;

use super::sync_manager::sync_log;

const BLOSSOM_BATCH_UPLOAD_CONCURRENCY: usize = 4;

pub struct PreparedNoteRevisionPublish {
    pub note_id: String,
    pub event: Event,
}

pub async fn push_note_revision(
    app: &AppHandle,
    active_relay_url: &str,
    backup_relay_urls: &[String],
    keys: &Keys,
    note_id: &str,
) -> Result<(), AppError> {
    let prepared = prepare_note_revision_publish(app, keys, note_id).await?;
    let event = prepared.event;

    let fanout = send_event_to_relays(active_relay_url, backup_relay_urls, keys, &event).await?;

    mark_note_revision_published(app, note_id, &event.id.to_hex())?;

    sync_log(
        app,
        &format!(
            "pushed revision note {note_id} to {}/{} relays",
            fanout.success_count, fanout.relay_count
        ),
    );
    Ok(())
}

pub async fn prepare_note_revision_publish(
    app: &AppHandle,
    keys: &Keys,
    note_id: &str,
) -> Result<PreparedNoteRevisionPublish, AppError> {
    maybe_upload_note_attachments(app, note_id, keys).await?;
    build_prepared_note_revision_publish(app, keys, note_id)
}

pub async fn prepare_note_revision_publishes_batch(
    app: &AppHandle,
    keys: &Keys,
    note_ids: &[String],
) -> Vec<(String, Result<PreparedNoteRevisionPublish, AppError>)> {
    let upload_summary = match maybe_upload_note_attachments_batch(app, note_ids, keys).await {
        Ok(summary) => summary,
        Err(error) => {
            return note_ids
                .iter()
                .cloned()
                .map(|note_id| (note_id, Err(AppError::custom(error.to_string()))))
                .collect();
        }
    };

    note_ids
        .iter()
        .cloned()
        .map(|note_id| {
            if let Some(message) = upload_summary.note_error(&note_id) {
                return (note_id, Err(AppError::custom(message)));
            }

            let result = build_prepared_note_revision_publish(app, keys, &note_id);
            (note_id, result)
        })
        .collect()
}

pub async fn push_note_revisions_batch(
    app: &AppHandle,
    active_relay_url: &str,
    backup_relay_urls: &[String],
    keys: &Keys,
    note_ids: &[String],
) -> Result<(), AppError> {
    if note_ids.is_empty() {
        return Ok(());
    }

    let prepared_results = prepare_note_revision_publishes_batch(app, keys, note_ids).await;
    let mut prepared_publishes = Vec::new();

    for (note_id, result) in prepared_results {
        match result {
            Ok(prepared) => prepared_publishes.push(prepared),
            Err(error) => {
                sync_log(app, &format!("revision push error: {note_id}: {error}"));
            }
        }
    }

    if prepared_publishes.is_empty() {
        return Ok(());
    }

    let events = prepared_publishes
        .iter()
        .map(|prepared| prepared.event.clone())
        .collect::<Vec<_>>();

    match send_events_to_relays_batch(active_relay_url, backup_relay_urls, keys, &events).await {
        Ok(fanout) => {
            for prepared in prepared_publishes {
                let event_id = prepared.event.id.to_hex();
                let success_count = fanout.success_counts.get(&event_id).copied().unwrap_or(0);

                if success_count > 0 {
                    match mark_note_revision_published(app, &prepared.note_id, &event_id) {
                        Ok(()) => {
                            sync_log(
                                app,
                                &format!(
                                    "pushed revision note {} to {}/{} relays",
                                    prepared.note_id, success_count, fanout.relay_count
                                ),
                            );
                        }
                        Err(error) => {
                            sync_log(
                                app,
                                &format!(
                                    "revision push finalize error: {}: {}",
                                    prepared.note_id, error
                                ),
                            );
                        }
                    }
                } else if let Some(message) = fanout.rejection_messages.get(&event_id) {
                    sync_log(
                        app,
                        &format!(
                            "revision push error: {}: relay rejected event: {}",
                            prepared.note_id, message
                        ),
                    );
                } else {
                    sync_log(
                        app,
                        &format!(
                            "revision push error: {}: event failed on every configured sync relay",
                            prepared.note_id
                        ),
                    );
                }
            }

            Ok(())
        }
        Err(error) => {
            for prepared in prepared_publishes {
                sync_log(
                    app,
                    &format!("revision push error: {}: {}", prepared.note_id, error),
                );
            }

            Err(error)
        }
    }
}

struct BatchAttachmentUploadSummary {
    note_hashes: HashMap<String, Vec<String>>,
    failed_hash_errors: HashMap<String, String>,
}

struct PendingAttachmentUpload {
    plaintext_hash: String,
    ciphertext_hash: String,
    ciphertext: Vec<u8>,
    encryption_key: String,
    plaintext_size: usize,
}

impl BatchAttachmentUploadSummary {
    fn note_error(&self, note_id: &str) -> Option<String> {
        let hashes = self.note_hashes.get(note_id)?;
        let failures = hashes
            .iter()
            .filter_map(|hash| {
                self.failed_hash_errors
                    .get(hash)
                    .map(|error| format!("{} ({error})", &hash[..8.min(hash.len())]))
            })
            .collect::<Vec<_>>();

        if failures.is_empty() {
            None
        } else {
            Some(format!(
                "Attachment upload failed for note {note_id}: {}",
                failures.join(", ")
            ))
        }
    }
}

async fn maybe_upload_note_attachments_batch(
    app: &AppHandle,
    note_ids: &[String],
    keys: &Keys,
) -> Result<BatchAttachmentUploadSummary, AppError> {
    let (blossom_url, note_hashes) = {
        let conn = database_connection(app)?;
        let blossom_url = get_blossom_url(&conn);
        let mut note_hashes = HashMap::<String, Vec<String>>::new();
        let mut stmt = conn.prepare("SELECT markdown FROM notes WHERE id = ?1")?;

        for note_id in note_ids {
            let markdown: String = stmt.query_row(params![note_id], |row| row.get(0))?;
            let attachment_hashes = extract_attachment_hashes(&markdown)
                .into_iter()
                .collect::<HashSet<_>>()
                .into_iter()
                .collect::<Vec<_>>();
            note_hashes.insert(note_id.clone(), attachment_hashes);
        }

        (blossom_url, note_hashes)
    };

    let total_attachment_refs = note_hashes.values().map(Vec::len).sum::<usize>();
    if total_attachment_refs == 0 {
        return Ok(BatchAttachmentUploadSummary {
            note_hashes,
            failed_hash_errors: HashMap::new(),
        });
    }

    let Some(blossom_url) = blossom_url else {
        sync_log(
            app,
            &format!(
                "revision blossom batch skip notes={} attachments={} but no blossom url configured",
                note_ids.len(),
                total_attachment_refs
            ),
        );
        return Ok(BatchAttachmentUploadSummary {
            note_hashes,
            failed_hash_errors: HashMap::new(),
        });
    };

    let unique_hashes = note_hashes
        .values()
        .flat_map(|hashes| hashes.iter().cloned())
        .collect::<HashSet<_>>()
        .into_iter()
        .collect::<Vec<_>>();

    sync_log(
        app,
        &format!(
            "revision blossom batch upload notes={} attachment_refs={} unique_attachments={} concurrency={} url={}",
            note_ids.len(),
            total_attachment_refs,
            unique_hashes.len(),
            BLOSSOM_BATCH_UPLOAD_CONCURRENCY,
            blossom_url
        ),
    );

    let http_client = reqwest::Client::new();
    let pubkey_hex = keys.public_key().to_hex();
    let mut uploaded = 0usize;
    let mut reused = 0usize;
    let mut failed_hash_errors = HashMap::new();
    let mut pending_uploads = Vec::new();

    for hash in &unique_hashes {
        let existing: Option<(String, String)> = {
            let conn = database_connection(app)?;
            conn.query_row(
                "SELECT ciphertext_hash, encryption_key
                 FROM blob_meta
                 WHERE plaintext_hash = ?1 AND server_url = ?2 AND pubkey = ?3",
                params![hash, blossom_url, pubkey_hex],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()?
        };

        if let Some((ciphertext_hash, _)) = existing {
            let head_url = format!("{}/{}", blossom_url.trim_end_matches('/'), ciphertext_hash);
            let exists = http_client
                .head(&head_url)
                .send()
                .await
                .map(|response| response.status().is_success())
                .unwrap_or(false);

            if exists {
                reused += 1;
                continue;
            }

            let conn = database_connection(app)?;
            conn.execute(
                "DELETE FROM blob_meta WHERE plaintext_hash = ?1 AND server_url = ?2 AND pubkey = ?3",
                params![hash, blossom_url, pubkey_hex],
            )?;
        }

        let (blob_data, _) = crate::adapters::filesystem::attachments::read_blob(app, hash)?
            .ok_or_else(|| {
                AppError::custom(format!(
                    "Local attachment missing for revision sync: {hash}"
                ))
            })?;
        let (ciphertext, encryption_key) =
            crate::adapters::blossom::client::encrypt_blob(&blob_data)?;
        let ciphertext_hash = format!("{:x}", Sha256::digest(&ciphertext));
        pending_uploads.push(PendingAttachmentUpload {
            plaintext_hash: hash.clone(),
            ciphertext_hash,
            ciphertext,
            encryption_key,
            plaintext_size: blob_data.len(),
        });
    }

    if !pending_uploads.is_empty() {
        let batch_items = pending_uploads
            .iter()
            .enumerate()
            .map(
                |(index, upload)| crate::adapters::blossom::client::BlossomBatchUploadItem {
                    part: format!("file-{}", index + 1),
                    ciphertext_hash: upload.ciphertext_hash.clone(),
                    ciphertext: upload.ciphertext.clone(),
                    content_type: "application/octet-stream".to_string(),
                },
            )
            .collect::<Vec<_>>();

        match crate::adapters::blossom::client::upload_blobs_batch(
            &http_client,
            &blossom_url,
            &batch_items,
            keys,
        )
        .await
        {
            Ok(results) => {
                let upload_by_part = batch_items
                    .iter()
                    .zip(pending_uploads.iter())
                    .map(|(item, upload)| (item.part.as_str(), upload))
                    .collect::<HashMap<_, _>>();

                for result in results {
                    let Some(upload) = upload_by_part.get(result.part.as_str()) else {
                        continue;
                    };

                    if result.status == 200 {
                        let ciphertext_hash = result
                            .ciphertext_hash
                            .unwrap_or_else(|| upload.ciphertext_hash.clone());
                        persist_attachment_upload_metadata(
                            app,
                            &blossom_url,
                            &pubkey_hex,
                            upload,
                            &ciphertext_hash,
                        )?;
                        uploaded += 1;
                    } else {
                        let error = result
                            .error
                            .unwrap_or_else(|| format!("batch upload failed ({})", result.status));
                        sync_log(
                            app,
                            &format!(
                                "revision blossom batch error plaintext={}: {}",
                                &upload.plaintext_hash[..8.min(upload.plaintext_hash.len())],
                                error
                            ),
                        );
                        failed_hash_errors.insert(upload.plaintext_hash.clone(), error);
                    }
                }
            }
            Err(error) if error.to_string().contains("batch upload unsupported") => {
                sync_log(
                    app,
                    "revision blossom batch upload unsupported, falling back to single uploads",
                );

                for upload in pending_uploads {
                    match crate::adapters::blossom::client::upload_blob(
                        &http_client,
                        &blossom_url,
                        upload.ciphertext.clone(),
                        keys,
                    )
                    .await
                    {
                        Ok(ciphertext_hash) => {
                            persist_attachment_upload_metadata(
                                app,
                                &blossom_url,
                                &pubkey_hex,
                                &upload,
                                &ciphertext_hash,
                            )?;
                            uploaded += 1;
                        }
                        Err(error) => {
                            sync_log(
                                app,
                                &format!(
                                    "revision blossom batch error plaintext={}: {}",
                                    &upload.plaintext_hash[..8.min(upload.plaintext_hash.len())],
                                    error
                                ),
                            );
                            failed_hash_errors
                                .insert(upload.plaintext_hash.clone(), error.to_string());
                        }
                    }
                }
            }
            Err(error) => {
                for upload in pending_uploads {
                    sync_log(
                        app,
                        &format!(
                            "revision blossom batch error plaintext={}: {}",
                            &upload.plaintext_hash[..8.min(upload.plaintext_hash.len())],
                            error
                        ),
                    );
                    failed_hash_errors.insert(upload.plaintext_hash.clone(), error.to_string());
                }
            }
        }
    }

    sync_log(
        app,
        &format!(
            "revision blossom batch ready notes={} uploaded={} reused={} failed={}",
            note_ids.len(),
            uploaded,
            reused,
            failed_hash_errors.len()
        ),
    );

    Ok(BatchAttachmentUploadSummary {
        note_hashes,
        failed_hash_errors,
    })
}

fn build_prepared_note_revision_publish(
    app: &AppHandle,
    keys: &Keys,
    note_id: &str,
) -> Result<PreparedNoteRevisionPublish, AppError> {
    let recipient = keys.public_key();
    let event = {
        let conn = database_connection(app)?;
        let pending = if let Some(existing) =
            build_materialized_note_revision_for_publish(&conn, keys, &recipient, note_id)?
        {
            existing
        } else {
            let pending = build_pending_note_revision(&conn, keys, &recipient, note_id)?;
            persist_local_note_revision(&conn, &pending)?;
            pending
        };
        crate::adapters::nostr::nip59_ext::gift_wrap(keys, &recipient, pending.rumor, pending.tags)?
    };

    Ok(PreparedNoteRevisionPublish {
        note_id: note_id.to_string(),
        event,
    })
}

pub fn mark_note_revision_published(
    app: &AppHandle,
    note_id: &str,
    event_id_hex: &str,
) -> Result<(), AppError> {
    let conn = database_connection(app)?;
    conn.execute(
        "UPDATE notes SET sync_event_id = ?1, locally_modified = 0 WHERE id = ?2",
        rusqlite::params![event_id_hex, note_id],
    )?;
    Ok(())
}

async fn maybe_upload_note_attachments(
    app: &AppHandle,
    note_id: &str,
    keys: &Keys,
) -> Result<(), AppError> {
    let (blossom_url, markdown) = {
        let conn = database_connection(app)?;
        let blossom_url = get_blossom_url(&conn);
        let markdown: String = conn.query_row(
            "SELECT markdown FROM notes WHERE id = ?1",
            rusqlite::params![note_id],
            |row| row.get(0),
        )?;
        (blossom_url, markdown)
    };

    let attachment_hashes = extract_attachment_hashes(&markdown);
    if attachment_hashes.is_empty() {
        sync_log(
            app,
            &format!("revision blossom skip note={note_id}: no attachments"),
        );
        return Ok(());
    }

    let Some(blossom_url) = blossom_url else {
        sync_log(
            app,
            &format!(
                "revision blossom skip note={note_id}: attachments={} but no blossom url configured",
                attachment_hashes.len()
            ),
        );
        return Ok(());
    };

    sync_log(
        app,
        &format!(
            "revision blossom upload note={note_id} attachments={} url={}",
            attachment_hashes.len(),
            blossom_url
        ),
    );

    let http_client = reqwest::Client::new();
    let pubkey_hex = keys.public_key().to_hex();
    let mut unique_hashes = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for hash in attachment_hashes {
        if seen.insert(hash.clone()) {
            unique_hashes.push(hash);
        }
    }

    let mut uploaded = 0usize;
    let mut reused = 0usize;

    for hash in unique_hashes {
        let existing: Option<(String, String)> = {
            let conn = database_connection(app)?;
            conn.query_row(
                "SELECT ciphertext_hash, encryption_key
                 FROM blob_meta
                 WHERE plaintext_hash = ?1 AND server_url = ?2 AND pubkey = ?3",
                params![hash, blossom_url, pubkey_hex],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()?
        };

        if let Some((ciphertext_hash, _)) = existing {
            let head_url = format!("{}/{}", blossom_url.trim_end_matches('/'), ciphertext_hash);
            let exists = http_client
                .head(&head_url)
                .send()
                .await
                .map(|response| response.status().is_success())
                .unwrap_or(false);

            if exists {
                reused += 1;
                sync_log(
                    app,
                    &format!(
                        "revision blossom reuse note={note_id} plaintext={} ciphertext={}",
                        &hash[..8.min(hash.len())],
                        &ciphertext_hash[..8.min(ciphertext_hash.len())]
                    ),
                );
                continue;
            }

            let conn = database_connection(app)?;
            conn.execute(
                "DELETE FROM blob_meta WHERE plaintext_hash = ?1 AND server_url = ?2 AND pubkey = ?3",
                params![hash, blossom_url, pubkey_hex],
            )?;
            sync_log(
                app,
                &format!(
                    "revision blossom stale metadata cleared note={note_id} plaintext={}",
                    &hash[..8.min(hash.len())]
                ),
            );
        }

        let (blob_data, _) = crate::adapters::filesystem::attachments::read_blob(app, &hash)?
            .ok_or_else(|| {
                AppError::custom(format!(
                    "Local attachment missing for revision sync: {hash}"
                ))
            })?;

        let (ciphertext, key_hex) = crate::adapters::blossom::client::encrypt_blob(&blob_data)?;
        let ciphertext_hash = crate::adapters::blossom::client::upload_blob(
            &http_client,
            &blossom_url,
            ciphertext,
            keys,
        )
        .await?;

        let conn = database_connection(app)?;
        conn.execute(
            "INSERT OR REPLACE INTO blob_meta (plaintext_hash, server_url, pubkey, ciphertext_hash, encryption_key)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![hash, blossom_url, pubkey_hex, ciphertext_hash, key_hex],
        )?;
        conn.execute(
            "INSERT OR REPLACE INTO blob_uploads (object_hash, server_url, encrypted, size_bytes, uploaded_at)
             VALUES (?1, ?2, 1, ?3, ?4)",
            params![
                ciphertext_hash,
                blossom_url,
                blob_data.len() as i64,
                crate::domain::common::time::now_millis()
            ],
        )?;

        uploaded += 1;
        sync_log(
            app,
            &format!(
                "revision blossom encrypted upload note={note_id} plaintext={} ciphertext={} bytes={}",
                &hash[..8.min(hash.len())],
                &ciphertext_hash[..8.min(ciphertext_hash.len())],
                blob_data.len()
            ),
        );
    }

    sync_log(
        app,
        &format!("revision blossom ready note={note_id} uploaded={uploaded} reused={reused}"),
    );

    Ok(())
}

fn persist_attachment_upload_metadata(
    app: &AppHandle,
    blossom_url: &str,
    pubkey_hex: &str,
    upload: &PendingAttachmentUpload,
    ciphertext_hash: &str,
) -> Result<(), AppError> {
    let conn = database_connection(app)?;
    conn.execute(
        "INSERT OR REPLACE INTO blob_meta (plaintext_hash, server_url, pubkey, ciphertext_hash, encryption_key)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![
            upload.plaintext_hash,
            blossom_url,
            pubkey_hex,
            ciphertext_hash,
            upload.encryption_key
        ],
    )?;
    conn.execute(
        "INSERT OR REPLACE INTO blob_uploads (object_hash, server_url, encrypted, size_bytes, uploaded_at)
         VALUES (?1, ?2, 1, ?3, ?4)",
        params![
            ciphertext_hash,
            blossom_url,
            upload.plaintext_size as i64,
            crate::domain::common::time::now_millis()
        ],
    )?;
    Ok(())
}

pub async fn push_deletion_revision(
    app: &AppHandle,
    active_relay_url: &str,
    backup_relay_urls: &[String],
    keys: &Keys,
    entity_id: &str,
) -> Result<(), AppError> {
    let recipient = keys.public_key();
    let event = {
        let conn = database_connection(app)?;
        let pending = build_pending_note_deletion_revision(
            &conn,
            keys,
            &recipient,
            entity_id,
            crate::domain::common::time::now_millis(),
        )?;
        persist_local_deletion_revision(&conn, &pending)?;

        crate::adapters::nostr::nip59_ext::gift_wrap(keys, &recipient, pending.rumor, pending.tags)?
    };

    let fanout = send_event_to_relays(active_relay_url, backup_relay_urls, keys, &event).await?;

    let conn = database_connection(app)?;
    let _ = conn.execute(
        "DELETE FROM pending_deletions WHERE entity_id = ?1",
        rusqlite::params![entity_id],
    );

    sync_log(
        app,
        &format!(
            "pushed revision delete {entity_id} to {}/{} relays",
            fanout.success_count, fanout.relay_count
        ),
    );
    Ok(())
}

#[derive(Debug)]
struct RelayFanoutResult {
    success_count: usize,
    relay_count: usize,
}

pub struct BatchRelayFanoutResult {
    pub success_counts: HashMap<String, usize>,
    pub rejection_messages: HashMap<String, String>,
    pub relay_count: usize,
}

async fn send_event_to_relays(
    active_relay_url: &str,
    backup_relay_urls: &[String],
    keys: &Keys,
    event: &Event,
) -> Result<RelayFanoutResult, AppError> {
    let mut success_count = 0usize;
    let relay_count = 1 + backup_relay_urls.len();

    match RevisionRelayConnection::connect_authenticated(active_relay_url, keys).await {
        Ok(mut connection) => {
            if send_event_on_connection(&mut connection, event).await? {
                success_count += 1;
            }
        }
        Err(error) => {
            eprintln!(
                "[sync] revision active push connect error relay={active_relay_url}: {error}"
            );
        }
    }

    for relay_url in backup_relay_urls {
        match RevisionRelayConnection::connect_authenticated(relay_url, keys).await {
            Ok(mut connection) => match send_event_on_connection(&mut connection, event).await {
                Ok(true) => {
                    success_count += 1;
                }
                Ok(false) => {}
                Err(error) => {
                    eprintln!("[sync] revision backup push error relay={relay_url}: {error}");
                }
            },
            Err(error) => {
                eprintln!("[sync] revision backup connect error relay={relay_url}: {error}");
            }
        }
    }

    if success_count == 0 {
        return Err(AppError::custom(
            "Revision push failed on every configured sync relay",
        ));
    }

    Ok(RelayFanoutResult {
        success_count,
        relay_count,
    })
}

pub async fn send_events_to_relays_batch(
    active_relay_url: &str,
    backup_relay_urls: &[String],
    keys: &Keys,
    events: &[Event],
) -> Result<BatchRelayFanoutResult, AppError> {
    let mut success_counts = HashMap::<String, usize>::new();
    let mut rejection_messages = HashMap::<String, String>::new();
    let relay_count = 1 + backup_relay_urls.len();
    let relay_urls = std::iter::once(active_relay_url)
        .chain(backup_relay_urls.iter().map(String::as_str))
        .collect::<Vec<_>>();

    let mut any_success = false;

    for relay_url in relay_urls {
        match RevisionRelayConnection::connect_authenticated(relay_url, keys).await {
            Ok(mut connection) => match send_events_on_connection(&mut connection, events).await {
                Ok(result) => {
                    if !result.accepted_event_ids.is_empty() {
                        any_success = true;
                    }
                    for event_id in result.accepted_event_ids {
                        *success_counts.entry(event_id).or_insert(0) += 1;
                    }
                    for (event_id, message) in result.rejected_event_ids {
                        rejection_messages.entry(event_id).or_insert(message);
                    }
                }
                Err(error) => {
                    eprintln!("[sync] revision batch push error relay={relay_url}: {error}");
                }
            },
            Err(error) => {
                eprintln!("[sync] revision batch connect error relay={relay_url}: {error}");
            }
        }
    }

    if !any_success {
        return Err(AppError::custom(
            "Revision push failed on every configured sync relay",
        ));
    }

    Ok(BatchRelayFanoutResult {
        success_counts,
        rejection_messages,
        relay_count,
    })
}

struct RelayBatchConnectionResult {
    accepted_event_ids: HashSet<String>,
    rejected_event_ids: HashMap<String, String>,
}

async fn send_event_on_connection(
    connection: &mut RevisionRelayConnection,
    event: &Event,
) -> Result<bool, AppError> {
    connection.send_event(event).await?;
    match connection.recv_message().await? {
        RevisionRelayIncomingMessage::Ok { accepted: true, .. } => Ok(true),
        RevisionRelayIncomingMessage::Ok {
            accepted: false,
            message,
            ..
        } if message.starts_with("duplicate:") => Ok(true),
        RevisionRelayIncomingMessage::Ok {
            accepted: false,
            message,
            ..
        } => Err(AppError::custom(format!(
            "Revision relay rejected event: {message}"
        ))),
        other => Err(AppError::custom(format!(
            "Unexpected relay publish response: {other:?}"
        ))),
    }
}

async fn send_events_on_connection(
    connection: &mut RevisionRelayConnection,
    events: &[Event],
) -> Result<RelayBatchConnectionResult, AppError> {
    let mut pending_event_ids = events
        .iter()
        .map(|event| event.id.to_hex())
        .collect::<HashSet<_>>();
    let mut accepted_event_ids = HashSet::new();
    let mut rejected_event_ids = HashMap::new();

    for event in events {
        connection.send_event(event).await?;
    }

    while !pending_event_ids.is_empty() {
        match connection.recv_message().await? {
            RevisionRelayIncomingMessage::Ok {
                event_id,
                accepted: true,
                ..
            } => {
                if pending_event_ids.remove(&event_id) {
                    accepted_event_ids.insert(event_id);
                }
            }
            RevisionRelayIncomingMessage::Ok {
                event_id,
                accepted: false,
                message,
            } if message.starts_with("duplicate:") => {
                if pending_event_ids.remove(&event_id) {
                    accepted_event_ids.insert(event_id);
                }
            }
            RevisionRelayIncomingMessage::Ok {
                event_id,
                accepted: false,
                message,
            } => {
                if pending_event_ids.remove(&event_id) {
                    rejected_event_ids.insert(event_id, message);
                }
            }
            RevisionRelayIncomingMessage::Notice(message) => {
                eprintln!("[sync] revision batch relay notice: {message}");
            }
            other => {
                return Err(AppError::custom(format!(
                    "Unexpected relay batch publish response: {other:?}"
                )));
            }
        }
    }

    Ok(RelayBatchConnectionResult {
        accepted_event_ids,
        rejected_event_ids,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::sync::revision_codec::{
        build_revision_note_rumor, canonicalize_revision_payload, compute_document_coord,
        compute_revision_id, revision_envelope_tags, RevisionEnvelopeMeta, RevisionRumorInput,
        REVISION_SYNC_SCHEMA_VERSION,
    };
    use ::url::Url;
    use postgres::{Client as PgClient, NoTls};
    use reqwest::Client;
    use std::path::PathBuf;
    use std::process::{Child, Command, Stdio};
    use std::sync::Once;
    use std::thread;
    use std::time::Duration;

    const TEST_ADMIN_TOKEN: &str = "test-admin-token";
    static EXTERNAL_TEST_PREREQ_WARNING: Once = Once::new();

    #[tokio::test]
    async fn send_event_to_relays_succeeds_when_active_relay_is_unavailable() {
        if !external_relay_test_prereqs_available() {
            return;
        }

        let keys = Keys::generate();
        let backup = TestRevisionRelay::start(39437).await;
        let event = make_remote_note_event(&keys, "note-1", "Fallback", "# Fallback\n\nBody");

        let result = send_event_to_relays(
            "ws://127.0.0.1:39999/ws",
            std::slice::from_ref(&backup.ws_url),
            &keys,
            &event,
        )
        .await
        .unwrap();

        assert_eq!(result.success_count, 1);
        assert_eq!(result.relay_count, 2);

        backup.stop();
    }

    #[tokio::test]
    async fn send_event_to_relays_succeeds_when_active_private_relay_rejects_auth() {
        if !external_relay_test_prereqs_available() {
            return;
        }

        let keys = Keys::generate();
        let active_private = TestRevisionRelay::start_private(39438).await;
        let backup = TestRevisionRelay::start(39439).await;
        let event = make_remote_note_event(
            &keys,
            "note-1",
            "Backup Accepts",
            "# Backup Accepts\n\nBody",
        );

        let result = send_event_to_relays(
            &active_private.ws_url,
            std::slice::from_ref(&backup.ws_url),
            &keys,
            &event,
        )
        .await
        .unwrap();

        assert_eq!(result.success_count, 1);
        assert_eq!(result.relay_count, 2);

        active_private.stop();
        backup.stop();
    }

    #[tokio::test]
    async fn send_event_to_relays_fails_when_all_relays_fail() {
        if !external_relay_test_prereqs_available() {
            return;
        }

        let keys = Keys::generate();
        let private_backup = TestRevisionRelay::start_private(39440).await;
        let event = make_remote_note_event(&keys, "note-1", "No Relay", "# No Relay\n\nBody");

        let error = send_event_to_relays(
            "ws://127.0.0.1:39998/ws",
            std::slice::from_ref(&private_backup.ws_url),
            &keys,
            &event,
        )
        .await
        .unwrap_err();

        assert!(
            error
                .to_string()
                .contains("Revision push failed on every configured sync relay"),
            "unexpected error: {error}"
        );

        private_backup.stop();
    }

    struct TestRevisionRelay {
        child: Child,
        ws_url: String,
        _db_name: String,
    }

    impl TestRevisionRelay {
        async fn start(port: u16) -> Self {
            Self::start_with_options(port, false).await
        }

        async fn start_private(port: u16) -> Self {
            Self::start_with_options(port, true).await
        }

        async fn start_with_options(port: u16, private_mode: bool) -> Self {
            let db_name = format!("relay_push_test_{port}_{}", std::process::id());
            create_database(&db_name);

            let repo_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("../..")
                .canonicalize()
                .unwrap();
            let relay_dir = repo_root.join("relay");
            let root_ws_url = format!("ws://127.0.0.1:{port}");
            let ws_url = format!("{root_ws_url}/ws");
            let http_url = format!("http://127.0.0.1:{port}");

            let mut command = Command::new("bun");
            command
                .arg("run")
                .arg("src/index.ts")
                .current_dir(&relay_dir)
                .env("HOST", "127.0.0.1")
                .env("PORT", port.to_string())
                .env("DATABASE_URL", database_url_for(&db_name))
                .env("RELAY_URL", &root_ws_url)
                .stdout(Stdio::null())
                .stderr(Stdio::null());

            if private_mode {
                command
                    .env("PRIVATE_MODE", "true")
                    .env("RELAY_ADMIN_TOKEN", TEST_ADMIN_TOKEN);
            }

            let child = command.spawn().unwrap();
            wait_for_healthz(&format!("{http_url}/healthz")).await;

            Self {
                child,
                ws_url,
                _db_name: db_name,
            }
        }

        fn stop(mut self) {
            let _ = self.child.kill();
            let _ = self.child.wait();
            drop_database(&self._db_name);
        }
    }

    fn make_remote_note_event(keys: &Keys, note_id: &str, title: &str, markdown: &str) -> Event {
        let recipient = keys.public_key();
        let document_coord = compute_document_coord(keys.secret_key(), note_id);
        let canonical = canonicalize_revision_payload(
            &recipient.to_hex(),
            &document_coord,
            &[],
            "put",
            "note",
            title,
            markdown,
            100,
            200,
            200,
            None,
            None,
            None,
            false,
            &[],
        )
        .unwrap();
        let revision_id = compute_revision_id(keys.secret_key(), &canonical).unwrap();
        let rumor = build_revision_note_rumor(
            RevisionRumorInput {
                document_id: note_id,
                title,
                markdown,
                created_at: 100,
                modified_at: 200,
                edited_at: 200,
                archived_at: None,
                deleted_at: None,
                pinned_at: None,
                readonly: false,
                tags: &[],
                blob_tags: &[],
                entity_type: "note",
                parent_revision_ids: &[],
                op: "put",
            },
            keys.public_key(),
        );

        crate::adapters::nostr::nip59_ext::gift_wrap(
            keys,
            &recipient,
            rumor,
            revision_envelope_tags(&RevisionEnvelopeMeta {
                recipient: recipient.to_hex(),
                document_coord,
                revision_id,
                parent_revision_ids: vec![],
                op: "put".into(),
                mtime: 200,
                entity_type: None,
                schema_version: REVISION_SYNC_SCHEMA_VERSION.into(),
            }),
        )
        .unwrap()
    }

    fn external_relay_test_prereqs_available() -> bool {
        let has_test_database = std::env::var("TEST_DATABASE_URL")
            .ok()
            .filter(|value| !value.trim().is_empty())
            .is_some();
        let has_bun = Command::new("bun")
            .arg("--version")
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .map(|status| status.success())
            .unwrap_or(false);

        if has_test_database && has_bun {
            true
        } else {
            EXTERNAL_TEST_PREREQ_WARNING.call_once(|| {
                eprintln!(
                    "skipping revision relay process tests: TEST_DATABASE_URL and bun are required"
                );
            });
            false
        }
    }

    fn create_database(database_name: &str) {
        assert_valid_database_name(database_name);

        let database_name = database_name.to_string();
        thread::spawn(move || {
            let mut client = PgClient::connect(&database_url_for("postgres"), NoTls).unwrap();
            client
                .simple_query(&format!("CREATE DATABASE \"{database_name}\""))
                .unwrap();
        })
        .join()
        .unwrap();
    }

    fn drop_database(database_name: &str) {
        assert_valid_database_name(database_name);

        let database_name = database_name.to_string();
        let _ = thread::spawn(move || {
            if let Ok(mut client) = PgClient::connect(&database_url_for("postgres"), NoTls) {
                let _ = client.simple_query(&format!(
                    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '{database_name}' AND pid <> pg_backend_pid();"
                ));
                let _ = client.simple_query(&format!("DROP DATABASE IF EXISTS \"{database_name}\""));
            }
        })
        .join();
    }

    fn database_url_for(database_name: &str) -> String {
        let base = std::env::var("TEST_DATABASE_URL")
            .unwrap_or_else(|_| "postgres://localhost:5432/postgres".to_string());
        let mut url = Url::parse(&base).unwrap();
        url.set_path(&format!("/{database_name}"));
        url.to_string()
    }

    async fn wait_for_healthz(url: &str) {
        let client = Client::new();
        for _ in 0..50 {
            if let Ok(response) = client.get(url).send().await {
                if response.status().is_success() {
                    return;
                }
            }
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
        panic!("relay never became healthy: {url}");
    }

    fn assert_valid_database_name(name: &str) {
        assert!(
            !name.is_empty()
                && name.chars().all(|character| character.is_ascii_lowercase()
                    || character.is_ascii_digit()
                    || character == '_'),
            "invalid database name: {name}"
        );
    }
}

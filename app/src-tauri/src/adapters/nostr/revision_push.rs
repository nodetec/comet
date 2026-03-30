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
use std::time::Instant;
use tauri::{AppHandle, Emitter};

use super::sync_manager::sync_log;

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
    let event_note_ids = prepared_publishes
        .iter()
        .map(|prepared| (prepared.event.id.to_hex(), prepared.note_id.clone()))
        .collect::<HashMap<_, _>>();
    let ack_total = prepared_publishes.len();
    let mut acked = 0usize;

    let publish_future = send_events_to_relays_batch(
        active_relay_url,
        backup_relay_urls,
        keys,
        &events,
        |event_id| {
            let Some(note_id) = event_note_ids.get(event_id) else {
                return;
            };

            if let Err(error) = mark_note_revision_published(app, note_id, event_id) {
                sync_log(
                    app,
                    &format!("revision push finalize error: {}: {}", note_id, error),
                );
                return;
            }

            acked += 1;
            sync_log(
                app,
                &format!("revision relay ack {acked}/{ack_total} note={note_id}"),
            );
            let _ = app.emit("sync-progress", ());
        },
    );
    let blob_flush_future = flush_pending_blob_uploads(app, keys);
    let parallel_started_at = Instant::now();
    sync_log(
        app,
        &format!(
            "revision parallel start notes={} publishable={} relay={}",
            note_ids.len(),
            prepared_publishes.len(),
            active_relay_url
        ),
    );
    let ((fanout_result, publish_ms), (blob_flush_result, blob_ms)) = tokio::join!(
        async {
            let started_at = Instant::now();
            let result = publish_future.await;
            (result, started_at.elapsed().as_millis())
        },
        async {
            let started_at = Instant::now();
            let result = blob_flush_future.await;
            (result, started_at.elapsed().as_millis())
        }
    );
    let total_ms = parallel_started_at.elapsed().as_millis();
    let overlap_ms = publish_ms
        .saturating_add(blob_ms)
        .saturating_sub(total_ms);
    sync_log(
        app,
        &format!(
            "revision parallel complete notes={} total_ms={} publish_ms={} blob_ms={} overlap_ms={}",
            prepared_publishes.len(),
            total_ms,
            publish_ms,
            blob_ms,
            overlap_ms
        ),
    );

    if let Err(error) = blob_flush_result {
        sync_log(app, &format!("revision blossom queue error: {error}"));
    }
    let _ = app.emit("sync-progress", ());

    match fanout_result {
        Ok(fanout) => {
            for prepared in prepared_publishes {
                let event_id = prepared.event.id.to_hex();
                let success_count = fanout.success_counts.get(&event_id).copied().unwrap_or(0);

                if success_count > 0 {
                    sync_log(
                        app,
                        &format!(
                            "pushed revision note {} to {}/{} relays",
                            prepared.note_id, success_count, fanout.relay_count
                        ),
                    );
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

struct BatchAttachmentQueueSummary {
    note_hashes: HashMap<String, Vec<String>>,
    failed_hash_errors: HashMap<String, String>,
}

struct PendingAttachmentUpload {
    plaintext_hash: String,
    server_url: String,
    ciphertext_hash: String,
    ciphertext: Vec<u8>,
    encryption_key: String,
    content_type: String,
    plaintext_size: usize,
}

impl BatchAttachmentQueueSummary {
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
) -> Result<BatchAttachmentQueueSummary, AppError> {
    let queued_started_at = Instant::now();
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
        return Ok(BatchAttachmentQueueSummary {
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
        return Ok(BatchAttachmentQueueSummary {
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
            "revision blossom batch queue notes={} attachment_refs={} unique_attachments={} url={}",
            note_ids.len(),
            total_attachment_refs,
            unique_hashes.len(),
            blossom_url
        ),
    );

    let http_client = reqwest::Client::new();
    let pubkey_hex = keys.public_key().to_hex();
    let mut reused = 0usize;
    let mut failed_hash_errors = HashMap::new();
    let mut queued = 0usize;

    for hash in &unique_hashes {
        if let Some(pending_upload) =
            load_pending_blob_upload(app, hash, &blossom_url, &pubkey_hex)?
        {
            persist_attachment_blob_meta(app, &pubkey_hex, &pending_upload)?;
            queued += 1;
            continue;
        }

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

        let Some((blob_data, _)) =
            crate::adapters::filesystem::attachments::read_blob(app, hash)?
        else {
            failed_hash_errors.insert(
                hash.clone(),
                format!("Local attachment missing for revision sync: {hash}"),
            );
            continue;
        };
        let (ciphertext, encryption_key) =
            crate::adapters::blossom::client::encrypt_blob(&blob_data)?;
        let ciphertext_hash = format!("{:x}", Sha256::digest(&ciphertext));
        let upload = PendingAttachmentUpload {
            plaintext_hash: hash.clone(),
            server_url: blossom_url.clone(),
            ciphertext_hash,
            ciphertext,
            encryption_key,
            content_type: "application/octet-stream".to_string(),
            plaintext_size: blob_data.len(),
        };
        persist_attachment_blob_meta(app, &pubkey_hex, &upload)?;
        queue_pending_blob_upload(app, &pubkey_hex, &upload, None)?;
        queued += 1;
    }

    sync_log(
        app,
        &format!(
            "revision blossom batch queued notes={} queued={} reused={} failed={} queue_ms={}",
            note_ids.len(),
            queued,
            reused,
            failed_hash_errors.len(),
            queued_started_at.elapsed().as_millis()
        ),
    );

    Ok(BatchAttachmentQueueSummary {
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
    pubkey_hex: &str,
    upload: &PendingAttachmentUpload,
) -> Result<(), AppError> {
    let conn = database_connection(app)?;
    persist_attachment_blob_meta(app, pubkey_hex, upload)?;
    conn.execute(
        "INSERT OR REPLACE INTO blob_uploads (object_hash, server_url, encrypted, size_bytes, uploaded_at)
         VALUES (?1, ?2, 1, ?3, ?4)",
        params![
            &upload.ciphertext_hash,
            &upload.server_url,
            upload.plaintext_size as i64,
            crate::domain::common::time::now_millis()
        ],
    )?;
    conn.execute(
        "DELETE FROM pending_blob_uploads WHERE plaintext_hash = ?1",
        params![&upload.plaintext_hash],
    )?;
    Ok(())
}

fn persist_attachment_blob_meta(
    app: &AppHandle,
    pubkey_hex: &str,
    upload: &PendingAttachmentUpload,
) -> Result<(), AppError> {
    let conn = database_connection(app)?;
    conn.execute(
        "INSERT OR REPLACE INTO blob_meta (plaintext_hash, server_url, pubkey, ciphertext_hash, encryption_key)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![
            &upload.plaintext_hash,
            &upload.server_url,
            pubkey_hex,
            &upload.ciphertext_hash,
            &upload.encryption_key
        ],
    )?;
    Ok(())
}

fn queue_pending_blob_upload(
    app: &AppHandle,
    pubkey_hex: &str,
    upload: &PendingAttachmentUpload,
    last_error: Option<&str>,
) -> Result<(), AppError> {
    let now = crate::domain::common::time::now_millis();
    let conn = database_connection(app)?;
    conn.execute(
        "INSERT INTO pending_blob_uploads (
           plaintext_hash,
           server_url,
           pubkey,
           ciphertext_hash,
           encryption_key,
           ciphertext,
           content_type,
           size_bytes,
           last_error,
           created_at,
           updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)
         ON CONFLICT(plaintext_hash) DO UPDATE SET
           server_url = excluded.server_url,
           pubkey = excluded.pubkey,
           ciphertext_hash = excluded.ciphertext_hash,
           encryption_key = excluded.encryption_key,
           ciphertext = excluded.ciphertext,
           content_type = excluded.content_type,
           size_bytes = excluded.size_bytes,
           last_error = excluded.last_error,
           updated_at = excluded.updated_at",
        params![
            &upload.plaintext_hash,
            &upload.server_url,
            pubkey_hex,
            &upload.ciphertext_hash,
            &upload.encryption_key,
            &upload.ciphertext,
            &upload.content_type,
            upload.plaintext_size as i64,
            last_error,
            now
        ],
    )?;
    Ok(())
}

fn load_pending_blob_upload(
    app: &AppHandle,
    plaintext_hash: &str,
    server_url: &str,
    pubkey_hex: &str,
) -> Result<Option<PendingAttachmentUpload>, AppError> {
    let conn = database_connection(app)?;
    conn.query_row(
        "SELECT ciphertext_hash, encryption_key, ciphertext, content_type, size_bytes
         FROM pending_blob_uploads
         WHERE plaintext_hash = ?1 AND server_url = ?2 AND pubkey = ?3",
        params![plaintext_hash, server_url, pubkey_hex],
        |row| {
            Ok(PendingAttachmentUpload {
                plaintext_hash: plaintext_hash.to_string(),
                server_url: server_url.to_string(),
                ciphertext_hash: row.get(0)?,
                encryption_key: row.get(1)?,
                ciphertext: row.get(2)?,
                content_type: row.get(3)?,
                plaintext_size: row.get::<_, i64>(4)? as usize,
            })
        },
    )
    .optional()
    .map_err(Into::into)
}

fn list_pending_blob_uploads(
    app: &AppHandle,
    pubkey_hex: &str,
) -> Result<Vec<PendingAttachmentUpload>, AppError> {
    let conn = database_connection(app)?;
    let mut stmt = conn.prepare(
        "SELECT plaintext_hash, server_url, ciphertext_hash, encryption_key, ciphertext, content_type, size_bytes
         FROM pending_blob_uploads
         WHERE pubkey = ?1
         ORDER BY updated_at ASC, plaintext_hash ASC",
    )?;
    let rows = stmt.query_map(params![pubkey_hex], |row| {
        Ok(PendingAttachmentUpload {
            plaintext_hash: row.get(0)?,
            server_url: row.get(1)?,
            ciphertext_hash: row.get(2)?,
            encryption_key: row.get(3)?,
            ciphertext: row.get(4)?,
            content_type: row.get(5)?,
            plaintext_size: row.get::<_, i64>(6)? as usize,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

async fn flush_pending_blob_uploads(app: &AppHandle, keys: &Keys) -> Result<(), AppError> {
    let pubkey_hex = keys.public_key().to_hex();
    let pending_uploads = list_pending_blob_uploads(app, &pubkey_hex)?;
    if pending_uploads.is_empty() {
        return Ok(());
    }

    let uploads_by_server = pending_uploads.into_iter().fold(
        HashMap::<String, Vec<PendingAttachmentUpload>>::new(),
        |mut groups, upload| {
            groups.entry(upload.server_url.clone()).or_default().push(upload);
            groups
        },
    );

    let http_client = reqwest::Client::new();

    for (server_url, uploads) in uploads_by_server {
        let server_flush_started_at = Instant::now();
        sync_log(
            app,
            &format!(
                "revision blossom queued upload blobs={} url={}",
                uploads.len(),
                server_url
            ),
        );

        let batch_items = uploads
            .iter()
            .enumerate()
            .map(
                |(index, upload)| crate::adapters::blossom::client::BlossomBatchUploadItem {
                    part: format!("file-{}", index + 1),
                    ciphertext_hash: upload.ciphertext_hash.clone(),
                    ciphertext: upload.ciphertext.clone(),
                    content_type: upload.content_type.clone(),
                },
            )
            .collect::<Vec<_>>();

        let upload_by_part = batch_items
            .iter()
            .zip(uploads.iter())
            .map(|(item, upload)| (item.part.as_str(), upload))
            .collect::<HashMap<_, _>>();

        let mut uploaded = 0usize;
        let mut failed = 0usize;

        match crate::adapters::blossom::client::upload_blobs_batch(
            &http_client,
            &server_url,
            &batch_items,
            keys,
        )
        .await
        {
            Ok(results) => {
                for result in results {
                    let Some(upload) = upload_by_part.get(result.part.as_str()) else {
                        continue;
                    };

                    if result.status == 200 {
                        persist_attachment_upload_metadata(app, &pubkey_hex, upload)?;
                        uploaded += 1;
                    } else {
                        failed += 1;
                        queue_pending_blob_upload(
                            app,
                            &pubkey_hex,
                            upload,
                            Some(
                                result
                                    .error
                                    .as_deref()
                                    .unwrap_or("batch upload failed"),
                            ),
                        )?;
                    }
                }
            }
            Err(error) if error.to_string().contains("batch upload unsupported") => {
                sync_log(
                    app,
                    "revision blossom batch upload unsupported, falling back to single uploads",
                );
                for upload in uploads {
                    match crate::adapters::blossom::client::upload_blob(
                        &http_client,
                        &server_url,
                        upload.ciphertext.clone(),
                        keys,
                    )
                    .await
                    {
                        Ok(_) => {
                            persist_attachment_upload_metadata(app, &pubkey_hex, &upload)?;
                            uploaded += 1;
                        }
                        Err(error) => {
                            failed += 1;
                            queue_pending_blob_upload(
                                app,
                                &pubkey_hex,
                                &upload,
                                Some(&error.to_string()),
                            )?;
                        }
                    }
                }
            }
            Err(error) => {
                for upload in uploads {
                    failed += 1;
                    queue_pending_blob_upload(
                        app,
                        &pubkey_hex,
                        &upload,
                        Some(&error.to_string()),
                    )?;
                }
            }
        }

        sync_log(
            app,
            &format!(
                "revision blossom queued upload ready blobs={} uploaded={} failed={} elapsed_ms={}",
                batch_items.len(),
                uploaded,
                failed,
                server_flush_started_at.elapsed().as_millis()
            ),
        );
    }

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
    mut on_first_success: impl FnMut(&str),
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
            Ok(mut connection) => match send_events_on_connection(&mut connection, events, |event_id| {
                let entry = success_counts.entry(event_id.to_string()).or_insert(0);
                if *entry == 0 {
                    any_success = true;
                    on_first_success(event_id);
                }
                *entry += 1;
            })
            .await
            {
                Ok(result) => {
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
    mut on_accepted: impl FnMut(&str),
) -> Result<RelayBatchConnectionResult, AppError> {
    let mut pending_event_ids = events
        .iter()
        .map(|event| event.id.to_hex())
        .collect::<HashSet<_>>();
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
                    on_accepted(&event_id);
                }
            }
            RevisionRelayIncomingMessage::Ok {
                event_id,
                accepted: false,
                message,
            } if message.starts_with("duplicate:") => {
                if pending_event_ids.remove(&event_id) {
                    on_accepted(&event_id);
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

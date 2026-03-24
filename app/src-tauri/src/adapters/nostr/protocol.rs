use crate::domain::common::text::strip_title_line;
use crate::domain::common::time::{now_millis, now_secs};
use crate::domain::relay::model::{PublishNoteInput, PublishResult, PublishShortNoteInput};
use crate::error::AppError;
use nostr_sdk::prelude::*;
use rusqlite::{params, OptionalExtension};
use tauri::AppHandle;

pub async fn publish_note(
    app: &AppHandle,
    input: PublishNoteInput,
) -> Result<PublishResult, AppError> {
    let note_id = &input.note_id;

    // Synchronous DB block — Connection is not Send, must drop before any .await
    let (keys, d_tag, content, relay_urls) = {
        let conn = crate::db::database_connection(app)?;
        let (keys, _) = crate::adapters::tauri::key_store::keys_for_current_identity(app, &conn)?;

        let (id, markdown, existing_d_tag): (String, String, Option<String>) = conn
            .query_row(
                "SELECT id, markdown, nostr_d_tag FROM notes WHERE id = ?1",
                params![note_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .optional()?
            .ok_or_else(|| AppError::custom("Note not found."))?;

        let mut stmt = conn.prepare("SELECT url FROM relays WHERE kind = 'publish'")?;
        let relay_urls: Vec<String> = stmt
            .query_map([], |row| row.get(0))?
            .collect::<Result<Vec<_>, _>>()?;

        if relay_urls.is_empty() {
            return Err(AppError::custom(
                "No publish relays configured. Add one in Settings → Relays.",
            ));
        }

        let d_tag = if let Some(d) = existing_d_tag {
            d
        } else {
            conn.execute(
                "UPDATE notes SET nostr_d_tag = ?1 WHERE id = ?1",
                params![id],
            )?;
            id.clone()
        };

        let content = strip_title_line(&markdown);

        (keys, d_tag, content, relay_urls)
    };

    // Upload attachment images to Blossom and rewrite URIs to public URLs
    let blossom_url = {
        let conn = crate::db::database_connection(app)?;
        crate::adapters::sqlite::sync_repository::get_blossom_url(&conn)
    };
    eprintln!(
        "[publish] note={} blossom_url={} attachment_uploads={}",
        note_id,
        blossom_url.as_deref().unwrap_or("<none>"),
        blossom_url.is_some()
    );
    let content = if let Some(ref blossom_url) = blossom_url {
        crate::adapters::blossom::client::upload_and_rewrite_attachments(
            app,
            blossom_url,
            &content,
            &keys,
        )
        .await?
    } else {
        content
    };

    let now = now_secs() as u64;

    let mut event_tags: Vec<Tag> = vec![
        Tag::identifier(&d_tag),
        Tag::title(&input.title),
        Tag::custom(TagKind::custom("published_at"), vec![now.to_string()]),
    ];
    // Rewrite cover image URI if it references a local attachment
    let image = input.image.as_ref().map(|img| {
        if let Some(ref blossom_url) = blossom_url {
            if img.starts_with("attachment://") {
                return img.replace(
                    "attachment://",
                    &format!("{}/", blossom_url.trim_end_matches('/')),
                );
            }
        }
        img.clone()
    });
    if let Some(ref image) = image {
        event_tags.push(Tag::custom(TagKind::custom("image"), vec![image.clone()]));
    }
    for t in &input.tags {
        event_tags.push(Tag::hashtag(t));
    }

    let event = EventBuilder::new(Kind::LongFormTextNote, &content)
        .tags(event_tags)
        .sign_with_keys(&keys)
        .map_err(|e| AppError::custom(format!("Failed to sign event: {e}")))?;

    let client = Client::new(keys);
    for url in &relay_urls {
        client
            .add_relay(url.as_str())
            .await
            .map_err(|e| AppError::custom(format!("Failed to add relay {url}: {e}")))?;
    }
    client.connect().await;

    let relay_count = relay_urls.len();
    let result = tokio::time::timeout(
        std::time::Duration::from_secs(15),
        client.send_event(&event),
    )
    .await
    .map_err(|_| AppError::custom("Timed out sending event to relays."))?
    .map_err(|e| AppError::custom(format!("Failed to send event: {e}")))?;

    client.disconnect().await;

    let success_count = result.success.len();
    let fail_count = result.failed.len();

    if success_count > 0 {
        let conn = crate::db::database_connection(app)?;
        let published_at = now_millis();
        conn.execute(
            "UPDATE notes SET published_at = ?1, published_kind = 30023 WHERE id = ?2",
            params![published_at, note_id],
        )?;
    }

    Ok(PublishResult {
        success_count,
        fail_count,
        relay_count,
    })
}

pub async fn publish_short_note(
    app: &AppHandle,
    input: PublishShortNoteInput,
) -> Result<PublishResult, AppError> {
    let note_id = &input.note_id;

    let (keys, content, relay_urls) = {
        let conn = crate::db::database_connection(app)?;
        let (keys, _) = crate::adapters::tauri::key_store::keys_for_current_identity(app, &conn)?;

        let markdown: String = conn
            .query_row(
                "SELECT markdown FROM notes WHERE id = ?1",
                params![note_id],
                |row| row.get(0),
            )
            .optional()?
            .ok_or_else(|| AppError::custom("Note not found."))?;

        let mut stmt = conn.prepare("SELECT url FROM relays WHERE kind = 'publish'")?;
        let relay_urls: Vec<String> = stmt
            .query_map([], |row| row.get(0))?
            .collect::<Result<Vec<_>, _>>()?;

        if relay_urls.is_empty() {
            return Err(AppError::custom(
                "No publish relays configured. Add one in Settings → Relays.",
            ));
        }

        let content = strip_title_line(&markdown);

        (keys, content, relay_urls)
    };

    // Upload attachment images to Blossom and rewrite URIs to public URLs
    let blossom_url = {
        let conn = crate::db::database_connection(app)?;
        crate::adapters::sqlite::sync_repository::get_blossom_url(&conn)
    };
    eprintln!(
        "[publish-short] note={} blossom_url={} attachment_uploads={}",
        note_id,
        blossom_url.as_deref().unwrap_or("<none>"),
        blossom_url.is_some()
    );
    let content = if let Some(ref blossom_url) = blossom_url {
        crate::adapters::blossom::client::upload_and_rewrite_attachments(
            app,
            blossom_url,
            &content,
            &keys,
        )
        .await?
    } else {
        content
    };

    let mut event_tags: Vec<Tag> = Vec::new();
    for t in &input.tags {
        event_tags.push(Tag::hashtag(t));
    }

    let event = EventBuilder::new(Kind::TextNote, &content)
        .tags(event_tags)
        .sign_with_keys(&keys)
        .map_err(|e| AppError::custom(format!("Failed to sign event: {e}")))?;

    let client = Client::new(keys);
    for url in &relay_urls {
        client
            .add_relay(url.as_str())
            .await
            .map_err(|e| AppError::custom(format!("Failed to add relay {url}: {e}")))?;
    }
    client.connect().await;

    let relay_count = relay_urls.len();
    let result = tokio::time::timeout(
        std::time::Duration::from_secs(15),
        client.send_event(&event),
    )
    .await
    .map_err(|_| AppError::custom("Timed out sending event to relays."))?
    .map_err(|e| AppError::custom(format!("Failed to send event: {e}")))?;

    client.disconnect().await;

    let success_count = result.success.len();
    let fail_count = result.failed.len();

    if success_count > 0 {
        let conn = crate::db::database_connection(app)?;
        let published_at = now_millis();
        let event_id = event.id.to_hex();
        conn.execute(
            "UPDATE notes SET published_at = ?1, published_event_id = ?2, published_kind = 1 WHERE id = ?3",
            params![published_at, event_id, note_id],
        )?;
    }

    Ok(PublishResult {
        success_count,
        fail_count,
        relay_count,
    })
}

pub async fn delete_published_note(
    app: &AppHandle,
    note_id: &str,
) -> Result<PublishResult, AppError> {
    // Synchronous DB block
    let (keys, d_tag, published_event_id, relay_urls) = {
        let conn = crate::db::database_connection(app)?;
        let (keys, _) = crate::adapters::tauri::key_store::keys_for_current_identity(app, &conn)?;

        let (existing_d_tag, published_event_id): (Option<String>, Option<String>) = conn
            .query_row(
                "SELECT nostr_d_tag, published_event_id FROM notes WHERE id = ?1",
                params![note_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()?
            .ok_or_else(|| AppError::custom("Note not found."))?;

        if existing_d_tag.is_none() && published_event_id.is_none() {
            return Err(AppError::custom(
                "This note has not been published to Nostr.",
            ));
        }

        let mut stmt = conn.prepare("SELECT url FROM relays WHERE kind = 'publish'")?;
        let relay_urls: Vec<String> = stmt
            .query_map([], |row| row.get(0))?
            .collect::<Result<Vec<_>, _>>()?;

        if relay_urls.is_empty() {
            return Err(AppError::custom(
                "No publish relays configured. Add one in Settings → Relays.",
            ));
        }

        (keys, existing_d_tag, published_event_id, relay_urls)
    };

    // Build deletion request — target by coordinate (article) or event ID (note)
    let mut deletion_request = EventDeletionRequest::new();
    if let Some(ref d) = d_tag {
        let coordinate = Coordinate::new(Kind::LongFormTextNote, keys.public_key()).identifier(d);
        deletion_request = deletion_request.coordinate(coordinate);
    }
    if let Some(ref eid) = published_event_id {
        let event_id = EventId::parse(eid)
            .map_err(|e| AppError::custom(format!("Invalid published event ID: {e}")))?;
        deletion_request = deletion_request.id(event_id);
    }

    let deletion = EventBuilder::delete(deletion_request)
        .sign_with_keys(&keys)
        .map_err(|e| AppError::custom(format!("Failed to sign deletion event: {e}")))?;

    let client = Client::new(keys);
    for url in &relay_urls {
        client
            .add_relay(url.as_str())
            .await
            .map_err(|e| AppError::custom(format!("Failed to add relay {url}: {e}")))?;
    }
    client.connect().await;

    let relay_count = relay_urls.len();
    let result = tokio::time::timeout(
        std::time::Duration::from_secs(15),
        client.send_event(&deletion),
    )
    .await
    .map_err(|_| AppError::custom("Timed out sending deletion event to relays."))?
    .map_err(|e| AppError::custom(format!("Failed to send deletion event: {e}")))?;

    client.disconnect().await;

    let success_count = result.success.len();
    let fail_count = result.failed.len();

    if success_count > 0 {
        let conn = crate::db::database_connection(app)?;
        conn.execute(
            "UPDATE notes SET published_at = NULL, nostr_d_tag = NULL, published_event_id = NULL, published_kind = NULL WHERE id = ?1",
            params![note_id],
        )?;
    }

    Ok(PublishResult {
        success_count,
        fail_count,
        relay_count,
    })
}

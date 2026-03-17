use crate::error::{now_millis, now_secs, AppError};
use nostr_sdk::prelude::*;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

pub const DEFAULT_SYNC_RELAY: &str = "wss://relay.comet.md";
pub const DEFAULT_PUBLISH_RELAY: &str = "wss://relay.damus.io";
pub const DEFAULT_BLOSSOM_URL: &str = "https://blossom.comet.md";

/// Returns the npub for the stored identity,
/// generating a new keypair if one does not exist yet.
/// On first launch, also sets up default relay and blossom server.
pub fn ensure_identity(conn: &Connection) -> Result<String, AppError> {
    if let Some(npub) = get_npub(conn)? {
        return Ok(npub);
    }

    let keys = Keys::generate();
    let npub = keys.public_key().to_bech32().map_err(|e| AppError::custom(e.to_string()))?;
    let now = now_millis();

    conn.execute(
        "INSERT INTO nostr_identity (secret_key, public_key, npub, created_at)
         VALUES (?1, ?2, ?3, ?4)",
        params![
            keys.secret_key().to_secret_hex(),
            keys.public_key().to_hex(),
            npub,
            now,
        ],
    )?;

    // Set default relays and blossom server on first launch
    let _ = conn.execute(
        "INSERT OR IGNORE INTO relays (url, kind, created_at) VALUES (?1, 'sync', ?2)",
        params![DEFAULT_SYNC_RELAY, now],
    );
    let _ = conn.execute(
        "INSERT OR IGNORE INTO relays (url, kind, created_at) VALUES (?1, 'publish', ?2)",
        params![DEFAULT_PUBLISH_RELAY, now],
    );
    let _ = conn.execute(
        "INSERT OR IGNORE INTO app_settings (key, value) VALUES ('blossom_url', ?1)",
        params![DEFAULT_BLOSSOM_URL],
    );

    Ok(npub)
}

fn get_npub(conn: &Connection) -> Result<Option<String>, AppError> {
    conn.query_row("SELECT npub FROM nostr_identity LIMIT 1", [], |row| {
        row.get(0)
    })
    .optional()
    .map_err(Into::into)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Relay {
    pub url: String,
    pub kind: String,
    pub created_at: i64,
}

pub fn list_relays(conn: &Connection) -> Result<Vec<Relay>, AppError> {
    let mut stmt = conn
        .prepare("SELECT url, kind, created_at FROM relays ORDER BY created_at")?;
    let relays = stmt
        .query_map([], |row| {
            Ok(Relay {
                url: row.get(0)?,
                kind: row.get(1)?,
                created_at: row.get(2)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(relays)
}

pub fn set_sync_relay(conn: &Connection, url: &str) -> Result<Vec<Relay>, AppError> {
    let url = normalize_relay_url(url)?;
    let now = now_millis();

    // Remove any existing sync relay
    conn.execute("DELETE FROM relays WHERE kind = 'sync'", [])?;

    conn.execute(
        "INSERT OR REPLACE INTO relays (url, kind, created_at) VALUES (?1, 'sync', ?2)",
        params![url, now],
    )?;

    list_relays(conn)
}

pub fn remove_sync_relay(conn: &Connection) -> Result<Vec<Relay>, AppError> {
    conn.execute("DELETE FROM relays WHERE kind = 'sync'", [])?;
    list_relays(conn)
}

pub fn add_publish_relay(conn: &Connection, url: &str) -> Result<Vec<Relay>, AppError> {
    let url = normalize_relay_url(url)?;
    let now = now_millis();

    conn.execute(
        "INSERT INTO relays (url, kind, created_at) VALUES (?1, 'publish', ?2)",
        params![url, now],
    )
    .map_err(|_| AppError::custom(format!("Relay already added: {url}")))?;

    list_relays(conn)
}

pub fn remove_relay(conn: &Connection, url: &str, kind: &str) -> Result<Vec<Relay>, AppError> {
    conn.execute(
        "DELETE FROM relays WHERE url = ?1 AND kind = ?2",
        params![url, kind],
    )?;
    list_relays(conn)
}

fn normalize_relay_url(raw: &str) -> Result<String, AppError> {
    let parsed = url::Url::parse(raw.trim())
        .map_err(|_| AppError::custom("Invalid relay URL"))?;
    match parsed.scheme() {
        "wss" | "ws" => {}
        _ => return Err(AppError::custom("Relay URL must start with wss:// or ws://")),
    }
    Ok(parsed.as_str().trim_end_matches('/').to_string())
}


#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublishResult {
    pub success_count: usize,
    pub fail_count: usize,
    pub relay_count: usize,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PublishNoteInput {
    pub note_id: String,
    pub title: String,
    pub image: Option<String>,
    pub tags: Vec<String>,
}

pub async fn publish_note(app: &AppHandle, input: PublishNoteInput) -> Result<PublishResult, AppError> {
    let note_id = &input.note_id;

    // Synchronous DB block — Connection is not Send, must drop before any .await
    let (secret_hex, d_tag, content, relay_urls) = {
        let conn = crate::db::database_connection(app)?;

        let (id, markdown, existing_d_tag): (String, String, Option<String>) = conn
            .query_row(
                "SELECT id, markdown, nostr_d_tag FROM notes WHERE id = ?1",
                params![note_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .optional()?
            .ok_or_else(|| AppError::custom("Note not found."))?;

        let secret_hex: String = conn
            .query_row(
                "SELECT secret_key FROM nostr_identity LIMIT 1",
                [],
                |row| row.get(0),
            )
            .optional()?
            .ok_or_else(|| AppError::custom("No Nostr identity configured."))?;

        let mut stmt = conn
            .prepare("SELECT url FROM relays WHERE kind = 'publish'")?;
        let relay_urls: Vec<String> = stmt
            .query_map([], |row| row.get(0))?
            .collect::<Result<Vec<_>, _>>()?;

        if relay_urls.is_empty() {
            return Err(AppError::custom("No publish relays configured. Add one in Settings → Relays."));
        }

        let d_tag = match existing_d_tag {
            Some(d) => d,
            None => {
                conn.execute(
                    "UPDATE notes SET nostr_d_tag = ?1 WHERE id = ?1",
                    params![id],
                )?;
                id.clone()
            }
        };

        let content = strip_title_line(&markdown);

        (secret_hex, d_tag, content, relay_urls)
    };

    // Async relay block
    let secret_key =
        SecretKey::parse(&secret_hex).map_err(|e| AppError::custom(format!("Invalid secret key: {e}")))?;
    let keys = Keys::new(secret_key);

    let now = now_secs() as u64;

    let mut event_tags: Vec<Tag> = vec![
        Tag::identifier(&d_tag),
        Tag::title(&input.title),
        Tag::custom(
            TagKind::custom("published_at"),
            vec![now.to_string()],
        ),
    ];
    if let Some(ref image) = input.image {
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
            "UPDATE notes SET published_at = ?1 WHERE id = ?2",
            params![published_at, note_id],
        )?;
    }

    Ok(PublishResult {
        success_count,
        fail_count,
        relay_count,
    })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PublishShortNoteInput {
    pub note_id: String,
    pub tags: Vec<String>,
}

pub async fn publish_short_note(app: &AppHandle, input: PublishShortNoteInput) -> Result<PublishResult, AppError> {
    let note_id = &input.note_id;

    let (secret_hex, content, relay_urls) = {
        let conn = crate::db::database_connection(app)?;

        let markdown: String = conn
            .query_row(
                "SELECT markdown FROM notes WHERE id = ?1",
                params![note_id],
                |row| row.get(0),
            )
            .optional()?
            .ok_or_else(|| AppError::custom("Note not found."))?;

        let secret_hex: String = conn
            .query_row(
                "SELECT secret_key FROM nostr_identity LIMIT 1",
                [],
                |row| row.get(0),
            )
            .optional()?
            .ok_or_else(|| AppError::custom("No Nostr identity configured."))?;

        let mut stmt = conn
            .prepare("SELECT url FROM relays WHERE kind = 'publish'")?;
        let relay_urls: Vec<String> = stmt
            .query_map([], |row| row.get(0))?
            .collect::<Result<Vec<_>, _>>()?;

        if relay_urls.is_empty() {
            return Err(AppError::custom("No publish relays configured. Add one in Settings → Relays."));
        }

        let content = strip_title_line(&markdown);

        (secret_hex, content, relay_urls)
    };

    let secret_key =
        SecretKey::parse(&secret_hex).map_err(|e| AppError::custom(format!("Invalid secret key: {e}")))?;
    let keys = Keys::new(secret_key);

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
            "UPDATE notes SET published_at = ?1, published_event_id = ?2 WHERE id = ?3",
            params![published_at, event_id, note_id],
        )?;
    }

    Ok(PublishResult {
        success_count,
        fail_count,
        relay_count,
    })
}

pub async fn delete_published_note(app: &AppHandle, note_id: &str) -> Result<PublishResult, AppError> {
    // Synchronous DB block
    let (secret_hex, d_tag, published_event_id, relay_urls) = {
        let conn = crate::db::database_connection(app)?;

        let (existing_d_tag, published_event_id): (Option<String>, Option<String>) = conn
            .query_row(
                "SELECT nostr_d_tag, published_event_id FROM notes WHERE id = ?1",
                params![note_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()?
            .ok_or_else(|| AppError::custom("Note not found."))?;

        if existing_d_tag.is_none() && published_event_id.is_none() {
            return Err(AppError::custom("This note has not been published to Nostr."));
        }

        let secret_hex: String = conn
            .query_row(
                "SELECT secret_key FROM nostr_identity LIMIT 1",
                [],
                |row| row.get(0),
            )
            .optional()?
            .ok_or_else(|| AppError::custom("No Nostr identity configured."))?;

        let mut stmt = conn
            .prepare("SELECT url FROM relays WHERE kind = 'publish'")?;
        let relay_urls: Vec<String> = stmt
            .query_map([], |row| row.get(0))?
            .collect::<Result<Vec<_>, _>>()?;

        if relay_urls.is_empty() {
            return Err(AppError::custom("No publish relays configured. Add one in Settings → Relays."));
        }

        (secret_hex, existing_d_tag, published_event_id, relay_urls)
    };

    // Async relay block
    let secret_key =
        SecretKey::parse(&secret_hex).map_err(|e| AppError::custom(format!("Invalid secret key: {e}")))?;
    let keys = Keys::new(secret_key);

    // Build deletion request — target by coordinate (article) or event ID (note)
    let mut deletion_request = EventDeletionRequest::new();
    if let Some(ref d) = d_tag {
        let coordinate = Coordinate::new(Kind::LongFormTextNote, keys.public_key())
            .identifier(d);
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
            "UPDATE notes SET published_at = NULL, nostr_d_tag = NULL, published_event_id = NULL WHERE id = ?1",
            params![note_id],
        )?;
    }

    Ok(PublishResult {
        success_count,
        fail_count,
        relay_count,
    })
}

pub(crate) fn strip_title_line(markdown: &str) -> String {
    if let Some(rest) = markdown.strip_prefix("# ") {
        // Skip the first line (the H1 title)
        match rest.find('\n') {
            Some(pos) => rest[pos..].trim_start_matches('\n').to_string(),
            None => String::new(), // entire content was just the title
        }
    } else {
        markdown.to_string()
    }
}

/// Imports an nsec (bech32 or hex), replacing the existing identity.
/// Returns the new npub.
pub fn import_nsec(conn: &Connection, nsec: &str) -> Result<String, AppError> {
    let secret_key = SecretKey::parse(nsec).map_err(|e| AppError::custom(format!("Invalid key: {e}")))?;
    let keys = Keys::new(secret_key);
    let npub = keys.public_key().to_bech32().map_err(|e| AppError::custom(e.to_string()))?;
    let now = now_millis();

    conn.execute("DELETE FROM nostr_identity", [])?;

    conn.execute(
        "INSERT INTO nostr_identity (secret_key, public_key, npub, created_at)
         VALUES (?1, ?2, ?3, ?4)",
        params![
            keys.secret_key().to_secret_hex(),
            keys.public_key().to_hex(),
            npub,
            now,
        ],
    )?;

    Ok(npub)
}

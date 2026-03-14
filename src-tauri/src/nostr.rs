use nostr_sdk::prelude::*;
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::AppHandle;

/// Returns the npub for the stored identity,
/// generating a new keypair if one does not exist yet.
pub fn ensure_identity(conn: &Connection) -> Result<String, String> {
    if let Some(npub) = get_npub(conn)? {
        return Ok(npub);
    }

    let keys = Keys::generate();
    let npub = keys.public_key().to_bech32().map_err(|e| e.to_string())?;
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis() as i64;

    conn.execute(
        "INSERT INTO nostr_identity (secret_key, public_key, npub, created_at)
         VALUES (?1, ?2, ?3, ?4)",
        params![
            keys.secret_key().to_secret_hex(),
            keys.public_key().to_hex(),
            npub,
            now,
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok(npub)
}

fn get_npub(conn: &Connection) -> Result<Option<String>, String> {
    conn.query_row("SELECT npub FROM nostr_identity LIMIT 1", [], |row| {
        row.get(0)
    })
    .optional()
    .map_err(|e| e.to_string())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Relay {
    pub url: String,
    pub kind: String,
    pub created_at: i64,
}

pub fn list_relays(conn: &Connection) -> Result<Vec<Relay>, String> {
    let mut stmt = conn
        .prepare("SELECT url, kind, created_at FROM relays ORDER BY created_at")
        .map_err(|e| e.to_string())?;
    let relays = stmt
        .query_map([], |row| {
            Ok(Relay {
                url: row.get(0)?,
                kind: row.get(1)?,
                created_at: row.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(relays)
}

pub fn set_sync_relay(conn: &Connection, url: &str) -> Result<Vec<Relay>, String> {
    let url = normalize_relay_url(url)?;
    let now = now_ms()?;

    // Remove any existing sync relay
    conn.execute("DELETE FROM relays WHERE kind = 'sync'", [])
        .map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT OR REPLACE INTO relays (url, kind, created_at) VALUES (?1, 'sync', ?2)",
        params![url, now],
    )
    .map_err(|e| e.to_string())?;

    list_relays(conn)
}

pub fn remove_sync_relay(conn: &Connection) -> Result<Vec<Relay>, String> {
    conn.execute("DELETE FROM relays WHERE kind = 'sync'", [])
        .map_err(|e| e.to_string())?;
    list_relays(conn)
}

pub fn add_publish_relay(conn: &Connection, url: &str) -> Result<Vec<Relay>, String> {
    let url = normalize_relay_url(url)?;
    let now = now_ms()?;

    conn.execute(
        "INSERT INTO relays (url, kind, created_at) VALUES (?1, 'publish', ?2)",
        params![url, now],
    )
    .map_err(|_| format!("Relay already added: {url}"))?;

    list_relays(conn)
}

pub fn remove_relay(conn: &Connection, url: &str, kind: &str) -> Result<Vec<Relay>, String> {
    conn.execute(
        "DELETE FROM relays WHERE url = ?1 AND kind = ?2",
        params![url, kind],
    )
    .map_err(|e| e.to_string())?;
    list_relays(conn)
}

fn normalize_relay_url(url: &str) -> Result<String, String> {
    let url = url.trim();
    if !url.starts_with("wss://") && !url.starts_with("ws://") {
        return Err("Relay URL must start with wss:// or ws://".into());
    }
    // Strip trailing slash for consistency
    Ok(url.trim_end_matches('/').to_string())
}

fn now_ms() -> Result<i64, String> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())
        .map(|d| d.as_millis() as i64)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublishResult {
    pub success_count: usize,
    pub fail_count: usize,
    pub relay_count: usize,
}

pub async fn publish_note(app: &AppHandle, note_id: &str) -> Result<PublishResult, String> {
    // Synchronous DB block — Connection is not Send, must drop before any .await
    let (secret_hex, d_tag, title, content, tags, relay_urls) = {
        let conn = crate::db::database_connection(app)?;

        let (id, title, markdown, existing_d_tag): (String, String, String, Option<String>) = conn
            .query_row(
                "SELECT id, title, markdown, nostr_d_tag FROM notes WHERE id = ?1",
                params![note_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .optional()
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "Note not found.".to_string())?;

        let secret_hex: String = conn
            .query_row(
                "SELECT secret_key FROM nostr_identity LIMIT 1",
                [],
                |row| row.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "No Nostr identity configured.".to_string())?;

        let mut stmt = conn
            .prepare("SELECT url FROM relays WHERE kind = 'publish'")
            .map_err(|e| e.to_string())?;
        let relay_urls: Vec<String> = stmt
            .query_map([], |row| row.get(0))
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;

        if relay_urls.is_empty() {
            return Err("No publish relays configured. Add one in Settings → Relays.".to_string());
        }

        let d_tag = match existing_d_tag {
            Some(d) => d,
            None => {
                conn.execute(
                    "UPDATE notes SET nostr_d_tag = ?1 WHERE id = ?1",
                    params![id],
                )
                .map_err(|e| e.to_string())?;
                id.clone()
            }
        };

        let tags = crate::db::extract_tags(&markdown);
        let content = strip_title_line(&markdown);

        (secret_hex, d_tag, title, content, tags, relay_urls)
    };

    // Async relay block
    let secret_key =
        SecretKey::parse(&secret_hex).map_err(|e| format!("Invalid secret key: {e}"))?;
    let keys = Keys::new(secret_key);

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_secs();

    let mut event_tags: Vec<Tag> = vec![
        Tag::identifier(&d_tag),
        Tag::title(&title),
        Tag::custom(
            TagKind::custom("published_at"),
            vec![now.to_string()],
        ),
    ];
    for t in &tags {
        event_tags.push(Tag::hashtag(t));
    }

    let event = EventBuilder::new(Kind::LongFormTextNote, &content)
        .tags(event_tags)
        .sign_with_keys(&keys)
        .map_err(|e| format!("Failed to sign event: {e}"))?;

    let client = Client::new(keys);
    for url in &relay_urls {
        client
            .add_relay(url.as_str())
            .await
            .map_err(|e| format!("Failed to add relay {url}: {e}"))?;
    }
    client.connect().await;

    let relay_count = relay_urls.len();
    let result = tokio::time::timeout(
        std::time::Duration::from_secs(15),
        client.send_event(&event),
    )
    .await
    .map_err(|_| "Timed out sending event to relays.".to_string())?
    .map_err(|e| format!("Failed to send event: {e}"))?;

    client.disconnect().await;

    let success_count = result.success.len();
    let fail_count = result.failed.len();

    Ok(PublishResult {
        success_count,
        fail_count,
        relay_count,
    })
}

fn strip_title_line(markdown: &str) -> String {
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
pub fn import_nsec(conn: &Connection, nsec: &str) -> Result<String, String> {
    let secret_key = SecretKey::parse(nsec).map_err(|e| format!("Invalid key: {e}"))?;
    let keys = Keys::new(secret_key);
    let npub = keys.public_key().to_bech32().map_err(|e| e.to_string())?;
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis() as i64;

    conn.execute("DELETE FROM nostr_identity", [])
        .map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO nostr_identity (secret_key, public_key, npub, created_at)
         VALUES (?1, ?2, ?3, ?4)",
        params![
            keys.secret_key().to_secret_hex(),
            keys.public_key().to_hex(),
            npub,
            now,
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok(npub)
}

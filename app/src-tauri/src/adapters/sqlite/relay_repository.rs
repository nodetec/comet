use crate::domain::relay::model::Relay;
use crate::domain::relay::service::normalize_relay_url;
use crate::domain::common::time::now_millis;
use crate::error::AppError;
use rusqlite::{params, Connection};

pub fn list_relays(conn: &Connection) -> Result<Vec<Relay>, AppError> {
    let mut stmt = conn.prepare("SELECT url, kind, created_at FROM relays ORDER BY created_at")?;
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

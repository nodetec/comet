use crate::domain::relay::service::normalize_relay_url;
use crate::error::AppError;
use rusqlite::{params, Connection, OptionalExtension};

pub fn get_blossom_url(conn: &Connection) -> Option<String> {
    conn.query_row(
        "SELECT value FROM app_settings WHERE key = 'blossom_url'",
        [],
        |row| row.get(0),
    )
    .optional()
    .ok()
    .flatten()
}

pub fn get_sync_relay_url(conn: &Connection) -> Option<String> {
    ordered_available_sync_relay_urls(conn).into_iter().next()
}

pub fn list_sync_relay_urls(conn: &Connection) -> Vec<String> {
    let mut stmt = match conn
        .prepare("SELECT url FROM relays WHERE kind = 'sync' ORDER BY created_at ASC, url ASC")
    {
        Ok(stmt) => stmt,
        Err(_) => return Vec::new(),
    };

    let rows = match stmt.query_map([], |row| row.get(0)) {
        Ok(rows) => rows,
        Err(_) => return Vec::new(),
    };

    rows.collect::<Result<Vec<_>, _>>().unwrap_or_default()
}

pub fn list_paused_sync_relay_urls(conn: &Connection) -> Vec<String> {
    conn.query_row(
        "SELECT value FROM app_settings WHERE key = 'paused_sync_relays'",
        [],
        |row| row.get::<_, String>(0),
    )
    .optional()
    .ok()
    .flatten()
    .and_then(|value| serde_json::from_str::<Vec<String>>(&value).ok())
    .unwrap_or_default()
}

pub fn set_sync_relay_paused(
    conn: &Connection,
    relay_url: &str,
    paused: bool,
) -> Result<(), AppError> {
    let relay_url = normalize_relay_url(relay_url)?;
    let mut paused_relays = list_paused_sync_relay_urls(conn);

    if paused {
        if !paused_relays.iter().any(|url| url == &relay_url) {
            paused_relays.push(relay_url);
        }
    } else {
        paused_relays.retain(|url| url != &relay_url);
    }

    save_paused_sync_relay_urls(conn, &paused_relays)
}

pub fn clear_paused_sync_relay(conn: &Connection, relay_url: &str) -> Result<(), AppError> {
    set_sync_relay_paused(conn, relay_url, false)
}

pub fn clear_paused_sync_relay_urls(conn: &Connection) {
    let _ = conn.execute(
        "DELETE FROM app_settings WHERE key = 'paused_sync_relays'",
        [],
    );
}

pub fn get_preferred_sync_relay_url(conn: &Connection) -> Option<String> {
    conn.query_row(
        "SELECT value FROM app_settings WHERE key = 'preferred_sync_relay_url'",
        [],
        |row| row.get(0),
    )
    .optional()
    .ok()
    .flatten()
}

pub fn save_preferred_sync_relay_url(conn: &Connection, relay_url: &str) -> Result<(), AppError> {
    let relay_url = normalize_relay_url(relay_url)?;
    conn.execute(
        "INSERT OR REPLACE INTO app_settings (key, value) VALUES ('preferred_sync_relay_url', ?1)",
        params![relay_url],
    )?;
    Ok(())
}

pub fn clear_preferred_sync_relay_url(conn: &Connection) {
    let _ = conn.execute(
        "DELETE FROM app_settings WHERE key = 'preferred_sync_relay_url'",
        [],
    );
}

pub fn list_available_sync_relay_urls(conn: &Connection) -> Vec<String> {
    let paused = list_paused_sync_relay_urls(conn);
    list_sync_relay_urls(conn)
        .into_iter()
        .filter(|url| !paused.contains(url))
        .collect()
}

pub fn ordered_available_sync_relay_urls(conn: &Connection) -> Vec<String> {
    let mut relay_urls = list_available_sync_relay_urls(conn);

    if let Some(preferred_relay_url) = get_preferred_sync_relay_url(conn) {
        if let Some(index) = relay_urls
            .iter()
            .position(|url| *url == preferred_relay_url)
        {
            let preferred = relay_urls.remove(index);
            relay_urls.insert(0, preferred);
        }
    }

    if let Some(active_relay_url) = get_active_sync_relay_url(conn) {
        if let Some(index) = relay_urls.iter().position(|url| *url == active_relay_url) {
            let active = relay_urls.remove(index);
            let insert_at = usize::from(
                relay_urls
                    .first()
                    .zip(get_preferred_sync_relay_url(conn))
                    .is_some_and(|(first, preferred)| first == &preferred),
            );
            relay_urls.insert(insert_at, active);
        }
    }

    relay_urls
}

pub fn get_active_sync_relay_url(conn: &Connection) -> Option<String> {
    conn.query_row(
        "SELECT value FROM app_settings WHERE key = 'active_sync_relay_url'",
        [],
        |row| row.get(0),
    )
    .optional()
    .ok()
    .flatten()
}

pub fn save_active_sync_relay_url(conn: &Connection, relay_url: &str) {
    let _ = conn.execute(
        "INSERT OR REPLACE INTO app_settings (key, value) VALUES ('active_sync_relay_url', ?1)",
        params![relay_url],
    );
}

pub fn clear_active_sync_relay_url(conn: &Connection) {
    let _ = conn.execute(
        "DELETE FROM app_settings WHERE key = 'active_sync_relay_url'",
        [],
    );
}

fn save_paused_sync_relay_urls(conn: &Connection, relay_urls: &[String]) -> Result<(), AppError> {
    let value = serde_json::to_string(relay_urls)?;
    conn.execute(
        "INSERT OR REPLACE INTO app_settings (key, value) VALUES ('paused_sync_relays', ?1)",
        params![value],
    )?;
    Ok(())
}

pub fn get_checkpoint(conn: &Connection) -> i64 {
    conn.query_row(
        "SELECT value FROM app_settings WHERE key = 'sync_checkpoint'",
        [],
        |row| row.get::<_, String>(0),
    )
    .optional()
    .ok()
    .flatten()
    .and_then(|v| v.parse::<i64>().ok())
    .unwrap_or(0)
}

pub fn save_checkpoint(conn: &Connection, seq: i64) {
    let _ = conn.execute(
        "INSERT OR REPLACE INTO app_settings (key, value) VALUES ('sync_checkpoint', ?1)",
        params![seq.to_string()],
    );
}

#[cfg(test)]
mod tests {
    use super::{
        clear_active_sync_relay_url, get_sync_relay_url, list_available_sync_relay_urls,
        list_paused_sync_relay_urls, ordered_available_sync_relay_urls, save_active_sync_relay_url,
        save_preferred_sync_relay_url, set_sync_relay_paused,
    };
    use crate::adapters::sqlite::migrations::account_migrations;
    use crate::adapters::sqlite::relay_repository::set_sync_relay;

    #[test]
    fn orders_available_relays_by_preferred_then_active() {
        let mut conn = rusqlite::Connection::open_in_memory().unwrap();
        account_migrations().to_latest(&mut conn).unwrap();

        set_sync_relay(&conn, "ws://relay-1.local").unwrap();
        set_sync_relay(&conn, "ws://relay-2.local").unwrap();
        set_sync_relay(&conn, "ws://relay-3.local").unwrap();

        save_preferred_sync_relay_url(&conn, "ws://relay-3.local").unwrap();
        save_active_sync_relay_url(&conn, "ws://relay-2.local");

        assert_eq!(
            ordered_available_sync_relay_urls(&conn),
            vec![
                "ws://relay-3.local".to_string(),
                "ws://relay-2.local".to_string(),
                "ws://relay-1.local".to_string(),
            ]
        );
        assert_eq!(get_sync_relay_url(&conn), Some("ws://relay-3.local".into()));
    }

    #[test]
    fn excludes_paused_relays_from_available_ordering() {
        let mut conn = rusqlite::Connection::open_in_memory().unwrap();
        account_migrations().to_latest(&mut conn).unwrap();

        set_sync_relay(&conn, "ws://relay-1.local").unwrap();
        set_sync_relay(&conn, "ws://relay-2.local").unwrap();

        set_sync_relay_paused(&conn, "ws://relay-1.local", true).unwrap();

        assert_eq!(
            list_paused_sync_relay_urls(&conn),
            vec!["ws://relay-1.local".to_string()]
        );
        assert_eq!(
            list_available_sync_relay_urls(&conn),
            vec!["ws://relay-2.local".to_string()]
        );

        clear_active_sync_relay_url(&conn);
        assert_eq!(get_sync_relay_url(&conn), Some("ws://relay-2.local".into()));
    }
}

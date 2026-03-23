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
    conn.query_row(
        "SELECT url FROM relays WHERE kind = 'sync' LIMIT 1",
        [],
        |row| row.get(0),
    )
    .optional()
    .ok()
    .flatten()
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

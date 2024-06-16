use std::collections::HashMap;

use rusqlite::{params, Connection, Result}; // Import the Note struct

pub fn insert_initial_settings(conn: &Connection) -> Result<()> {
    let initial_settings = vec![
        // theme
        ("theme", "dark"),
        // editor
        ("vim", "true"),
        ("line_numbers", "false"),
        ("highlight_active_line", "false"),
        ("line_wrapping", "false"),
        ("unordered_list_bullet", "*"),
        ("indent_unit", "2"),
        ("tab_size", "4"),
        ("font_size", "4"),
        (
            "font_family",
            r#"SFMono-Regular, Consolas, "Liberation Mono", Menlo, Courier, monospace"#,
        ),
        ("font_weight", "normal"),
        ("line_height", "1.5"),
        // nostr
        ("public_key", ""),
        ("private_key", ""),
    ];

    for (key, value) in initial_settings {
        conn.execute(
            "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)",
            params![key, value],
        )?;
    }

    Ok(())
}

pub fn get_setting(conn: &Connection, key: &str) -> Result<String> {
    let mut stmt = conn.prepare("SELECT value FROM settings WHERE key = ?1")?;
    stmt.query_row(params![key], |row| Ok(row.get(0)?))
}

pub fn set_setting(conn: &Connection, key: &str, value: &str) -> Result<()> {
    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
        params![key, value],
    )?;

    Ok(())
}

pub fn get_all_settings(conn: &Connection) -> Result<HashMap<String, String>> {
    let mut stmt = conn.prepare("SELECT key, value FROM settings")?;
    let settings_iter = stmt.query_map(params![], |row| {
        let key: String = row.get(0)?;
        let value: String = row.get(1)?;
        Ok((key, value))
    })?;

    let mut settings = HashMap::new();
    for setting in settings_iter {
        let (key, value) = setting?;
        settings.insert(key, value);
    }

    Ok(settings)
}

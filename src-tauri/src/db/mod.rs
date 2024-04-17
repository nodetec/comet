pub mod notes;
pub mod notes_tags;
pub mod tags;

use rusqlite::{params, Connection, Result};

fn initialize_db(conn: &Connection) -> Result<()> {
    // TODO: add deleted_at column to all tables

    conn.execute(
        "CREATE TABLE IF NOT EXISTS notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            status_id INTEGER,
            notebook_id INTEGER,
            content TEXT NOT NULL,
            created_at TEXT NOT NULL,
            modified_at TEXT NOT NULL
        )",
        params![],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        color TEXT,
        icon TEXT,
        created_at TEXT NOT NULL,
        UNIQUE(name)
    )",
        params![],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS notes_tags (
            note_id INTEGER NOT NULL,
            tag_id INTEGER NOT NULL,
            PRIMARY KEY (note_id, tag_id),
            FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
            FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
        )",
        params![],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS status (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        deleted_at TEXT NOT NULL,
        UNIQUE(name)
    )",
        params![],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS notebooks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        deleted_at TEXT NOT NULL,
        UNIQUE(name)
    )",
        params![],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS archived_notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            note_id INTEGER,
            content TEXT NOT NULL,
            created_at TEXT NOT NULL,
            archived_at TEXT NOT NULL
        )",
        params![],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS archived_notes_tags (
            archived_note_id INTEGER NOT NULL,
            tag_id INTEGER NOT NULL,
            PRIMARY KEY (archived_note_id, tag_id),
            FOREIGN KEY (archived_note_id) REFERENCES archived_notes(id) ON DELETE CASCADE,
            FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
        )",
        params![],
    )?;

    Ok(())
}

fn create_indexes(conn: &Connection) -> Result<()> {
    // Create indexes for notes table
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_notes_created_at ON notes (created_at)",
        params![],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_notes_modified_at ON notes (modified_at)",
        params![],
    )?;

    // Create indexes for tags table
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_tags_name ON tags (name)",
        params![],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_tags_created_at ON tags (created_at)",
        params![],
    )?;

    Ok(())
}

pub fn establish_connection(db_path: &str) -> Result<Connection> {
    println!("Connecting to database at: {}", db_path);
    let conn = Connection::open(db_path)?;
    initialize_db(&conn)?;
    create_indexes(&conn)?;
    Ok(conn)
}

pub use notes::{create_note, delete_note, get_note_by_id, list_all_notes, update_note, archive_note, list_archived_notes};
pub use notes_tags::{list_notes_for_tag, list_tags_for_note, tag_note, untag_note};
pub use tags::{create_tag, delete_tag, get_tag_by_id, get_tag_by_name, list_all_tags, update_tag};

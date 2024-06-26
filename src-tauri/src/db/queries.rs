//Notes Queries
pub const INSERT_NOTE: &str = "INSERT INTO notes (content, created_at, modified_at) VALUES (?1, ?2, ?3)";
pub const INSERT_FTS_NOTE: &str = "INSERT INTO notes_fts (rowid, content, created_at, modified_at) VALUES (?1, ?2, ?3, ?4)";
pub const LIST_ALL_NOTES: &str = "SELECT id, content, created_at, modified_at FROM notes ORDER BY modified_at DESC LIMIT ?1 OFFSET ?2";
pub const LIST_ALL_NOTES_BY_TAG: &str = "SELECT n.id, n.content, n.created_at, n.modified_at FROM notes n JOIN notes_tags nt ON n.id = nt.note_id WHERE nt.tag_id = ?3 ORDER BY n.modified_at DESC LIMIT ?1 OFFSET ?2";
pub const SEARCH_NOTES: &str = "SELECT rowid, content, created_at, modified_at FROM notes_fts WHERE notes_fts MATCH ?3 ORDER BY modified_at DESC LIMIT ?1 OFFSET ?2";
pub const GET_NOTE: &str = "SELECT id, content, created_at, modified_at FROM notes WHERE id = ?1";
pub const UPDATE_NOTE: &str = "UPDATE notes SET content = ?1, modified_at = ?2 WHERE id = ?3";
pub const UPDATE_FTS_NOTE: &str = "UPDATE notes_fts SET content = ?1, modified_at = ?2 WHERE rowid = ?3";
pub const DELETE_TRASHED_NOTE: &str = "DELETE FROM trashed_notes WHERE id = ?1";
pub const TRASH_NOTE: &str = "INSERT INTO trashed_notes (note_id, content, created_at, trashed_at) VALUES (?1, ?2, ?3, ?4)";
pub const TRASH_NOTE_TAGS: &str = "INSERT INTO trashed_notes_tags (trashed_note_id, tag_id) VALUES (?1, ?2)";
pub const DELETE_NOTE_TAGS: &str = "DELETE FROM notes_tags WHERE note_id = ?1";
pub const DELETE_NOTE: &str = "DELETE FROM notes WHERE id = ?1";
pub const DELETE_FTS_NOTE: &str = "DELETE FROM notes_fts WHERE rowid = ?1";
pub const LIST_ALL_TRASHED_NOTES: &str = "SELECT id, note_id, content, created_at, trashed_at FROM trashed_notes ORDER BY trashed_at DESC";
pub const LIST_ALL_TRASHED_NOTES_BY_TAG: &str = "SELECT an.id, an.note_id, an.content, an.created_at, an.trashed_at FROM trashed_notes an JOIN trashed_notes_tags ant ON an.id = ant.note_id WHERE ant.tag_id = ?1 ORDER BY an.trashed_at DESC";

//Tags Queries
pub const INSERT_TAG: &str = "INSERT INTO tags (name, color, icon, created_at) VALUES (?1, ?2, ?3, ?4)";
pub const GET_TAG: &str = "SELECT id, name, color, icon, created_at FROM tags WHERE id = ?1";
pub const GET_TAG_BY_NAME: &str = "SELECT id, name, color, icon, created_at FROM tags WHERE name = ?1";
pub const LIST_ALL_TAGS: &str = "SELECT t.id, t.name, t.color, t.icon, t.created_at FROM tags t JOIN notes_tags nt ON t.id = nt.tag_id WHERE nt.note_id = ?1 ORDER BY t.name ASC";
pub const LIST_ALL_TAGS_BY_NOTE: &str = "SELECT id, name, color, icon, created_at FROM tags ORDER BY name ASC";
pub const UPDATE_TAG: &str = "UPDATE tags SET name = ?1, color = ?2, icon = ?3 WHERE id = ?4";
pub const DELETE_TAG: &str = "DELETE FROM tags WHERE id = ?1";

//Notes Tags Queries
pub const TAG_NOTE: &str = "INSERT INTO notes_tags (note_id, tag_id) VALUES (?1, ?2)";
pub const LIST_TAGS_FOR_NOTE: &str = "SELECT tag_id FROM notes_tags WHERE note_id = ?1";
pub const LIST_NOTES_FOR_TAG: &str = "SELECT note_id FROM notes_tags WHERE tag_id = ?1";
pub const UNTAG_NOTE: &str = "DELETE FROM notes_tags WHERE note_id = ?1 AND tag_id = ?2";

//Settings Queries
pub const INSERT_SETTING: &str = "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)";
pub const GET_SETTING: &str = "SELECT value FROM settings WHERE key = ?1";
pub const SET_SETTING: &str = "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)";
pub const LIST_SETTINGS: &str = "SELECT key, value FROM settings";
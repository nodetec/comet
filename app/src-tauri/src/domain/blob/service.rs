use regex_lite::Regex;
use rusqlite::{params, params_from_iter, types::Value, Connection};
use std::collections::HashSet;
use tauri::AppHandle;

use crate::error::AppError;

/// Detect image format from magic bytes.
pub fn detect_image_extension(data: &[u8]) -> Option<String> {
    if data.starts_with(&[0x89, 0x50, 0x4E, 0x47]) {
        Some("png".to_string())
    } else if data.starts_with(&[0xFF, 0xD8, 0xFF]) {
        Some("jpg".to_string())
    } else if data.starts_with(b"GIF8") {
        Some("gif".to_string())
    } else if data.starts_with(b"RIFF") && data.len() > 11 && &data[8..12] == b"WEBP" {
        Some("webp".to_string())
    } else if data.starts_with(b"<svg") || data.starts_with(b"<?xml") {
        Some("svg".to_string())
    } else {
        None
    }
}

/// Extract the file extension for a blob hash from markdown content.
pub fn extract_blob_extension(content: &str, hash: &str) -> Option<String> {
    let pattern = format!("attachment://{hash}.");
    if let Some(pos) = content.find(&pattern) {
        let after = &content[pos + pattern.len()..];
        let ext: String = after.chars().take_while(|c| c.is_alphanumeric()).collect();
        if !ext.is_empty() {
            return Some(ext);
        }
    }
    None
}

/// Extract `attachment://` hashes from markdown content.
pub fn extract_attachment_hashes(markdown: &str) -> Vec<String> {
    static RE: std::sync::LazyLock<Regex> =
        std::sync::LazyLock::new(|| Regex::new(r"attachment://([a-f0-9]{64})\.\w+").unwrap());
    RE.captures_iter(markdown)
        .map(|cap| cap[1].to_string())
        .collect()
}

/// Find attachment hashes in the given notes that are not referenced by any other note.
/// Must be called BEFORE the notes are deleted.
pub fn find_orphaned_blob_hashes(
    conn: &Connection,
    note_ids: &[String],
) -> Result<HashSet<String>, AppError> {
    if note_ids.is_empty() {
        return Ok(HashSet::new());
    }

    let placeholders: String = note_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
    let sql = format!("SELECT markdown FROM notes WHERE id IN ({placeholders})");
    let mut stmt = conn.prepare(&sql)?;
    let id_params: Vec<Value> = note_ids.iter().map(|id| Value::from(id.clone())).collect();
    let rows = stmt.query_map(params_from_iter(id_params.iter()), |row| {
        row.get::<_, String>(0)
    })?;

    let mut candidate_hashes = HashSet::new();
    for row in rows {
        for hash in extract_attachment_hashes(&row?) {
            candidate_hashes.insert(hash);
        }
    }

    if candidate_hashes.is_empty() {
        return Ok(HashSet::new());
    }

    let excluded = format!("SELECT markdown FROM notes WHERE id NOT IN ({placeholders})");
    let mut remaining_stmt = conn.prepare(&excluded)?;
    let excluded_params: Vec<Value> = note_ids.iter().map(|id| Value::from(id.clone())).collect();
    let remaining_rows = remaining_stmt
        .query_map(params_from_iter(excluded_params.iter()), |row| {
            row.get::<_, String>(0)
        })?;

    for row in remaining_rows {
        for hash in extract_attachment_hashes(&row?) {
            candidate_hashes.remove(&hash);
        }
        if candidate_hashes.is_empty() {
            break;
        }
    }

    Ok(candidate_hashes)
}

/// Clean up orphaned blobs: delete local files, remove `blob_meta/blob_uploads` entries.
/// Returns (`server_url`, `ciphertext_hash`) pairs for Blossom server deletion.
pub fn cleanup_orphaned_blobs(
    app: &AppHandle,
    conn: &Connection,
    orphaned_hashes: &HashSet<String>,
) -> Vec<(String, String)> {
    if orphaned_hashes.is_empty() {
        return Vec::new();
    }

    let mut blossom_deletions = Vec::new();

    let mut meta_stmt = conn
        .prepare("SELECT server_url, ciphertext_hash FROM blob_meta WHERE plaintext_hash = ?1")
        .ok();
    let mut del_meta_stmt = conn
        .prepare("DELETE FROM blob_meta WHERE plaintext_hash = ?1")
        .ok();
    let mut del_uploads_stmt = conn
        .prepare("DELETE FROM blob_uploads WHERE hash = ?1")
        .ok();

    for hash in orphaned_hashes {
        if let Some(ref mut stmt) = meta_stmt {
            if let Ok(rows) = stmt.query_map(params![hash], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            }) {
                for row in rows.flatten() {
                    blossom_deletions.push(row);
                }
            }
        }
        if let Some(ref mut stmt) = del_meta_stmt {
            let _ = stmt.execute(params![hash]);
        }
        if let Some(ref mut stmt) = del_uploads_stmt {
            let _ = stmt.execute(params![hash]);
        }
        let _ = crate::adapters::filesystem::attachments::delete_local_blob(app, hash);
        eprintln!(
            "[blob-gc] cleaned up orphaned blob hash={}",
            &hash[..8.min(hash.len())]
        );
    }

    blossom_deletions
}

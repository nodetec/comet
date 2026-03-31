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

/// Extract the file extension for a plaintext attachment hash from markdown.
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

/// Extract plaintext attachment hashes from `attachment://` markdown references.
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

/// Clean up orphaned blobs for plaintext attachment hashes.
///
/// This removes local files, deletes `blob_meta` bridge records, and returns
/// `(server_url, ciphertext_hash)` pairs for deleting the encrypted Blossom
/// objects those plaintext attachments pointed at. It also clears matching
/// `blob_uploads.object_hash` records for those stored Blossom objects.
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
        .prepare("DELETE FROM blob_uploads WHERE object_hash = ?1")
        .ok();
    let mut del_pending_uploads_stmt = conn
        .prepare("DELETE FROM pending_blob_uploads WHERE plaintext_hash = ?1")
        .ok();

    for hash in orphaned_hashes {
        let mut object_hashes = Vec::new();
        if let Some(ref mut stmt) = meta_stmt {
            if let Ok(rows) = stmt.query_map(params![hash], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            }) {
                for row in rows.flatten() {
                    object_hashes.push(row.1.clone());
                    blossom_deletions.push(row);
                }
            }
        }
        if let Some(ref mut stmt) = del_meta_stmt {
            let _ = stmt.execute(params![hash]);
        }
        if let Some(ref mut stmt) = del_pending_uploads_stmt {
            let _ = stmt.execute(params![hash]);
        }
        if let Some(ref mut stmt) = del_uploads_stmt {
            for object_hash in &object_hashes {
                let _ = stmt.execute(params![object_hash]);
            }
        }
        let _ = crate::adapters::filesystem::attachments::delete_local_blob(app, hash);
        eprintln!(
            "[blob-gc] cleaned up orphaned blob hash={}",
            &hash[..8.min(hash.len())]
        );
    }

    blossom_deletions
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── detect_image_extension ──────────────────────────────────────────

    #[test]
    fn detect_png_magic_bytes() {
        let data = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
        assert_eq!(detect_image_extension(&data), Some("png".to_string()));
    }

    #[test]
    fn detect_jpeg_magic_bytes() {
        let data = [0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10];
        assert_eq!(detect_image_extension(&data), Some("jpg".to_string()));
    }

    #[test]
    fn detect_gif_magic_bytes() {
        let data = b"GIF89a\x00\x00";
        assert_eq!(detect_image_extension(data), Some("gif".to_string()));
    }

    #[test]
    fn detect_webp_magic_bytes() {
        // RIFF....WEBP
        let mut data = Vec::from(b"RIFF" as &[u8]);
        data.extend_from_slice(&[0x00, 0x00, 0x00, 0x00]); // file size placeholder
        data.extend_from_slice(b"WEBP");
        assert_eq!(detect_image_extension(&data), Some("webp".to_string()));
    }

    #[test]
    fn detect_svg_xml_prefix() {
        let data = b"<?xml version=\"1.0\"?><svg>";
        assert_eq!(detect_image_extension(data), Some("svg".to_string()));
    }

    #[test]
    fn detect_svg_direct_tag() {
        let data = b"<svg xmlns=\"http://www.w3.org/2000/svg\">";
        assert_eq!(detect_image_extension(data), Some("svg".to_string()));
    }

    #[test]
    fn detect_unknown_data_returns_none() {
        let data = b"just some random text content";
        assert_eq!(detect_image_extension(data), None);
    }

    #[test]
    fn detect_empty_data_returns_none() {
        assert_eq!(detect_image_extension(&[]), None);
    }

    // ── extract_blob_extension ──────────────────────────────────────────

    #[test]
    fn extract_extension_from_attachment_url() {
        let hash = "a".repeat(64);
        let content = format!("![image](attachment://{hash}.png)");
        assert_eq!(
            extract_blob_extension(&content, &hash),
            Some("png".to_string())
        );
    }

    #[test]
    fn extract_extension_jpg() {
        let hash = "b".repeat(64);
        let content = format!("some text attachment://{hash}.jpg more text");
        assert_eq!(
            extract_blob_extension(&content, &hash),
            Some("jpg".to_string())
        );
    }

    #[test]
    fn extract_extension_missing_hash_returns_none() {
        let content = "![image](attachment://deadbeef.png)";
        let hash = "a".repeat(64);
        assert_eq!(extract_blob_extension(content, &hash), None);
    }

    #[test]
    fn extract_extension_no_extension_returns_none() {
        let hash = "c".repeat(64);
        let content = format!("attachment://{hash}.)");
        assert_eq!(extract_blob_extension(&content, &hash), None);
    }

    // ── extract_attachment_hashes ────────────────────────────────────────

    #[test]
    fn extract_multiple_hashes() {
        let hash1 = "a".repeat(64);
        let hash2 = "b".repeat(64);
        let markdown =
            format!("![img1](attachment://{hash1}.png)\n![img2](attachment://{hash2}.webp)");
        let hashes = extract_attachment_hashes(&markdown);
        assert_eq!(hashes, vec![hash1, hash2]);
    }

    #[test]
    fn extract_no_matches() {
        let markdown = "# Just a note\n\nNo attachments here.";
        let hashes = extract_attachment_hashes(markdown);
        assert!(hashes.is_empty());
    }

    #[test]
    fn extract_deduplication_preserves_all_occurrences() {
        // The regex captures all occurrences; dedup is the caller's responsibility.
        let hash = "d".repeat(64);
        let markdown = format!("![a](attachment://{hash}.png)\n![b](attachment://{hash}.jpg)");
        let hashes = extract_attachment_hashes(&markdown);
        assert_eq!(hashes.len(), 2);
        assert_eq!(hashes[0], hash);
        assert_eq!(hashes[1], hash);
    }

    #[test]
    fn extract_ignores_short_hashes() {
        let markdown = "![img](attachment://tooshort.png)";
        assert!(extract_attachment_hashes(markdown).is_empty());
    }
}

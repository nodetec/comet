use crate::error::AppError;
use regex_lite::Regex;
use rusqlite::{params, params_from_iter, types::Value, Connection};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

const ALLOWED_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "gif", "webp", "svg"];

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedImage {
    /// Content-addressed URI: attachment://{sha256}.{ext}
    pub uri: String,
    /// Full SHA-256 hash of the file content
    pub hash: String,
}

fn attachments_dir(app: &AppHandle) -> Result<PathBuf, AppError> {
    let config_dir = app.path().app_config_dir()?;
    let dir = config_dir.join("attachments");
    fs::create_dir_all(&dir)?;
    Ok(dir)
}

pub fn get_attachments_dir(app: &AppHandle) -> Result<String, AppError> {
    let dir = attachments_dir(app)?;
    dir.to_str()
        .map(|s| s.to_string())
        .ok_or_else(|| AppError::custom("Attachments path is not valid UTF-8"))
}

pub fn import_image(app: &AppHandle, source_path: &str) -> Result<ImportedImage, AppError> {
    let source = PathBuf::from(source_path);

    let ext = source
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .ok_or_else(|| AppError::custom("File has no extension"))?;

    if !ALLOWED_EXTENSIONS.contains(&ext.as_str()) {
        return Err(AppError::custom(format!(
            "Unsupported image type: .{ext}. Allowed: {}",
            ALLOWED_EXTENSIONS.join(", ")
        )));
    }

    let file_bytes = fs::read(&source)?;

    let mut hasher = Sha256::new();
    hasher.update(&file_bytes);
    let hash = format!("{:x}", hasher.finalize());

    let dest_filename = format!("{hash}.{ext}");
    let dir = attachments_dir(app)?;
    let dest_path = dir.join(&dest_filename);

    if !dest_path.exists() {
        fs::write(&dest_path, &file_bytes)?;
    }

    Ok(ImportedImage {
        uri: format!("attachment://{dest_filename}"),
        hash,
    })
}

const KNOWN_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "gif", "webp", "svg", "bin"];

/// Check if a blob exists locally by its plaintext hash.
pub fn has_local_blob(app: &AppHandle, hash: &str) -> Result<bool, AppError> {
    let dir = attachments_dir(app)?;
    for ext in KNOWN_EXTENSIONS {
        if dir.join(format!("{hash}.{ext}")).exists() {
            return Ok(true);
        }
    }
    Ok(false)
}

/// Save a blob to the attachments directory with the given hash and extension.
pub fn save_blob(app: &AppHandle, hash: &str, ext: &str, data: &[u8]) -> Result<(), AppError> {
    let dir = attachments_dir(app)?;
    let filename = format!("{hash}.{ext}");
    let path = dir.join(filename);
    fs::write(&path, data)?;
    Ok(())
}

/// Delete a blob from the local attachments directory by its hash.
/// Returns true if a file was deleted.
pub fn delete_local_blob(app: &AppHandle, hash: &str) -> Result<bool, AppError> {
    let dir = attachments_dir(app)?;
    for ext in KNOWN_EXTENSIONS {
        let path = dir.join(format!("{hash}.{ext}"));
        if path.exists() {
            fs::remove_file(&path)?;
            return Ok(true);
        }
    }
    Ok(false)
}

/// Extract attachment:// hashes from markdown content.
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

    // Collect all hashes referenced by notes being deleted
    let placeholders: String = note_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
    let sql = format!("SELECT markdown FROM notes WHERE id IN ({})", placeholders);
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

    // Check which hashes are still referenced by other notes using SQL
    // to avoid pulling all markdown into memory
    let excluded = format!(
        "SELECT markdown FROM notes WHERE id NOT IN ({})",
        placeholders
    );
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
            break; // Early exit — all candidates are still referenced
        }
    }

    Ok(candidate_hashes)
}

/// Clean up orphaned blobs: delete local files, remove blob_meta/blob_uploads entries.
/// Returns (server_url, ciphertext_hash) pairs for Blossom server deletion.
pub fn cleanup_orphaned_blobs(
    app: &AppHandle,
    conn: &Connection,
    orphaned_hashes: &HashSet<String>,
) -> Vec<(String, String)> {
    if orphaned_hashes.is_empty() {
        return Vec::new();
    }

    let mut blossom_deletions = Vec::new();

    // Prepare statements once outside the loop
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
        let _ = delete_local_blob(app, hash);
        eprintln!(
            "[blob-gc] cleaned up orphaned blob hash={}",
            &hash[..8.min(hash.len())]
        );
    }

    blossom_deletions
}

/// Read a blob from the attachments directory by its hash.
/// Returns (bytes, extension).
pub fn read_blob(app: &AppHandle, hash: &str) -> Result<Option<(Vec<u8>, String)>, AppError> {
    let dir = attachments_dir(app)?;
    for ext in KNOWN_EXTENSIONS {
        let path = dir.join(format!("{hash}.{ext}"));
        if path.exists() {
            let data = fs::read(&path)?;
            return Ok(Some((data, ext.to_string())));
        }
    }
    Ok(None)
}

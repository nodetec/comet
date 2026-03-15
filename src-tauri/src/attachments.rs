use serde::Serialize;
use sha2::{Digest, Sha256};
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

fn attachments_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let config_dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("Failed to resolve app config dir: {e}"))?;
    let dir = config_dir.join("attachments");
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create attachments dir: {e}"))?;
    Ok(dir)
}

pub fn get_attachments_dir(app: &AppHandle) -> Result<String, String> {
    let dir = attachments_dir(app)?;
    dir.to_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "Attachments path is not valid UTF-8".to_string())
}

pub fn import_image(app: &AppHandle, source_path: &str) -> Result<ImportedImage, String> {
    let source = PathBuf::from(source_path);

    let ext = source
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .ok_or_else(|| "File has no extension".to_string())?;

    if !ALLOWED_EXTENSIONS.contains(&ext.as_str()) {
        return Err(format!(
            "Unsupported image type: .{ext}. Allowed: {}",
            ALLOWED_EXTENSIONS.join(", ")
        ));
    }

    let file_bytes =
        fs::read(&source).map_err(|e| format!("Failed to read source file: {e}"))?;

    let mut hasher = Sha256::new();
    hasher.update(&file_bytes);
    let hash = format!("{:x}", hasher.finalize());

    let dest_filename = format!("{hash}.{ext}");
    let dir = attachments_dir(app)?;
    let dest_path = dir.join(&dest_filename);

    if !dest_path.exists() {
        fs::write(&dest_path, &file_bytes)
            .map_err(|e| format!("Failed to write attachment: {e}"))?;
    }

    Ok(ImportedImage {
        uri: format!("attachment://{dest_filename}"),
        hash,
    })
}

const KNOWN_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "gif", "webp", "svg", "bin"];

/// Check if a blob exists locally by its plaintext hash.
pub fn has_local_blob(app: &AppHandle, hash: &str) -> Result<bool, String> {
    let dir = attachments_dir(app)?;
    for ext in KNOWN_EXTENSIONS {
        if dir.join(format!("{hash}.{ext}")).exists() {
            return Ok(true);
        }
    }
    Ok(false)
}

/// Save a blob to the attachments directory with the given hash and extension.
pub fn save_blob(app: &AppHandle, hash: &str, ext: &str, data: &[u8]) -> Result<(), String> {
    let dir = attachments_dir(app)?;
    let filename = format!("{hash}.{ext}");
    let path = dir.join(filename);
    fs::write(&path, data).map_err(|e| format!("Failed to save blob: {e}"))
}

/// Read a blob from the attachments directory by its hash.
/// Returns (bytes, extension).
pub fn read_blob(app: &AppHandle, hash: &str) -> Result<Option<(Vec<u8>, String)>, String> {
    let dir = attachments_dir(app)?;
    for ext in KNOWN_EXTENSIONS {
        let path = dir.join(format!("{hash}.{ext}"));
        if path.exists() {
            let data = fs::read(&path).map_err(|e| e.to_string())?;
            return Ok(Some((data, ext.to_string())));
        }
    }
    Ok(None)
}

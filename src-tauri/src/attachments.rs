use serde::Serialize;
use sha2::{Digest, Sha256};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

const ALLOWED_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "gif", "webp", "svg"];

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedImage {
    pub relative_path: String,
    pub absolute_path: String,
}

fn attachments_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let config_dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("Failed to resolve app config dir: {e}"))?;
    let dir = config_dir.join("attachments");
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|e| format!("Failed to create attachments dir: {e}"))?;
    }
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
    let hash = hasher.finalize();
    let hash_hex = format!("{:x}", hash);
    let hash_prefix = &hash_hex[..12];

    let stem = source
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("image");
    let dest_filename = format!("{hash_prefix}-{stem}.{ext}");

    let dir = attachments_dir(app)?;
    let dest_path = dir.join(&dest_filename);

    if !dest_path.exists() {
        fs::write(&dest_path, &file_bytes)
            .map_err(|e| format!("Failed to write attachment: {e}"))?;
    }

    let absolute_path = dest_path
        .to_str()
        .ok_or_else(|| "Destination path is not valid UTF-8".to_string())?
        .to_string();

    Ok(ImportedImage {
        relative_path: format!("attachments/{dest_filename}"),
        absolute_path,
    })
}

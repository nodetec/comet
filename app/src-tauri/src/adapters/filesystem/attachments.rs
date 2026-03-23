use crate::domain::blob::error::BlobError;
use crate::error::AppError;
pub use crate::ports::blob_storage::ImportedImage;
use crate::ports::blob_storage::BlobStorage;
use sha2::{Digest, Sha256};
use std::fs;
use std::path::PathBuf;
use tauri::AppHandle;

const ALLOWED_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "gif", "webp", "svg"];
const KNOWN_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "gif", "webp", "svg", "bin"];

// ---------------------------------------------------------------------------
// FsBlobStorage — implements BlobStorage trait
// ---------------------------------------------------------------------------

/// Filesystem-backed blob storage, wrapping an attachments directory path.
pub struct FsBlobStorage {
    dir: PathBuf,
}

impl FsBlobStorage {
    pub fn new(dir: PathBuf) -> Self {
        Self { dir }
    }
}

impl BlobStorage for FsBlobStorage {
    fn has_blob(&self, hash: &str) -> Result<bool, BlobError> {
        for ext in KNOWN_EXTENSIONS {
            if self.dir.join(format!("{hash}.{ext}")).exists() {
                return Ok(true);
            }
        }
        Ok(false)
    }

    fn read_blob(&self, hash: &str) -> Result<Option<(Vec<u8>, String)>, BlobError> {
        for ext in KNOWN_EXTENSIONS {
            let path = self.dir.join(format!("{hash}.{ext}"));
            if path.exists() {
                let data = fs::read(&path)?;
                return Ok(Some((data, ext.to_string())));
            }
        }
        Ok(None)
    }

    fn save_blob(&self, hash: &str, ext: &str, data: &[u8]) -> Result<(), BlobError> {
        let filename = format!("{hash}.{ext}");
        let path = self.dir.join(filename);
        log::info!(
            "[blob] writing local file plaintext_hash={} ext={} bytes={} path={}",
            hash,
            ext,
            data.len(),
            path.display()
        );
        fs::write(&path, data)?;
        Ok(())
    }

    fn delete_blob(&self, hash: &str) -> Result<bool, BlobError> {
        for ext in KNOWN_EXTENSIONS {
            let path = self.dir.join(format!("{hash}.{ext}"));
            if path.exists() {
                fs::remove_file(&path)?;
                return Ok(true);
            }
        }
        Ok(false)
    }

    fn import_image(&self, source_path: &str) -> Result<ImportedImage, BlobError> {
        let source = PathBuf::from(source_path);

        let ext = source
            .extension()
            .and_then(|e| e.to_str())
            .map(str::to_lowercase)
            .ok_or_else(|| BlobError::Storage("File has no extension".into()))?;

        if !ALLOWED_EXTENSIONS.contains(&ext.as_str()) {
            return Err(BlobError::UnsupportedType(ext));
        }

        let file_bytes = fs::read(&source)?;

        let mut hasher = Sha256::new();
        hasher.update(&file_bytes);
        let hash = format!("{:x}", hasher.finalize());

        let dest_filename = format!("{hash}.{ext}");
        let dest_path = self.dir.join(&dest_filename);

        if !dest_path.exists() {
            fs::write(&dest_path, &file_bytes)?;
        }

        Ok(ImportedImage {
            uri: format!("attachment://{dest_filename}"),
            hash,
        })
    }

    fn attachments_dir(&self) -> Result<String, BlobError> {
        self.dir
            .to_str()
            .map(std::string::ToString::to_string)
            .ok_or_else(|| BlobError::Storage("Attachments path is not valid UTF-8".into()))
    }
}

// ---------------------------------------------------------------------------
// Convenience functions that take AppHandle (for callers not yet on the trait)
// ---------------------------------------------------------------------------

fn dir_from_app(app: &AppHandle) -> Result<PathBuf, AppError> {
    crate::db::active_account_attachments_dir(app)
}

fn storage_from_app(app: &AppHandle) -> Result<FsBlobStorage, AppError> {
    Ok(FsBlobStorage::new(dir_from_app(app)?))
}

pub fn get_attachments_dir(app: &AppHandle) -> Result<String, AppError> {
    Ok(storage_from_app(app)?.attachments_dir()?)
}

pub fn import_image(app: &AppHandle, source_path: &str) -> Result<ImportedImage, AppError> {
    Ok(storage_from_app(app)?.import_image(source_path)?)
}

pub fn has_local_blob(app: &AppHandle, hash: &str) -> Result<bool, AppError> {
    Ok(storage_from_app(app)?.has_blob(hash)?)
}

pub fn save_blob(app: &AppHandle, hash: &str, ext: &str, data: &[u8]) -> Result<(), AppError> {
    Ok(storage_from_app(app)?.save_blob(hash, ext, data)?)
}

pub fn delete_local_blob(app: &AppHandle, hash: &str) -> Result<bool, AppError> {
    Ok(storage_from_app(app)?.delete_blob(hash)?)
}

pub fn read_blob(app: &AppHandle, hash: &str) -> Result<Option<(Vec<u8>, String)>, AppError> {
    Ok(storage_from_app(app)?.read_blob(hash)?)
}

use crate::domain::blob::error::BlobError;
use serde::Serialize;

/// Result of importing an image into local blob storage.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedImage {
    pub uri: String,
    pub hash: String,
}

/// Abstracts local filesystem operations for blob/attachment storage.
pub trait BlobStorage {
    fn has_blob(&self, hash: &str) -> Result<bool, BlobError>;
    fn read_blob(&self, hash: &str) -> Result<Option<(Vec<u8>, String)>, BlobError>;
    fn save_blob(&self, hash: &str, ext: &str, data: &[u8]) -> Result<(), BlobError>;
    fn delete_blob(&self, hash: &str) -> Result<bool, BlobError>;
    fn import_image(&self, source_path: &str) -> Result<ImportedImage, BlobError>;
    fn attachments_dir(&self) -> Result<String, BlobError>;
}

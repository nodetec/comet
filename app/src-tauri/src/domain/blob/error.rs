#[derive(Debug, thiserror::Error)]
pub enum BlobError {
    #[allow(dead_code)]
    #[error("Blob not found.")]
    NotFound,

    #[error("Unsupported image type: .{0}. Allowed: png, jpg, jpeg, gif, webp, svg")]
    UnsupportedType(String),

    #[error("{0}")]
    Storage(String),
}

impl From<std::io::Error> for BlobError {
    fn from(e: std::io::Error) -> Self {
        BlobError::Storage(e.to_string())
    }
}

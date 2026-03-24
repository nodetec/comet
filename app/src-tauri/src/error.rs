use crate::domain::accounts::error::AccountError;
use crate::domain::blob::error::BlobError;
use crate::domain::notes::error::NoteError;
use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("{0}")]
    Db(#[from] rusqlite::Error),

    #[error("{0}")]
    Migration(#[from] rusqlite_migration::Error),

    #[error("{0}")]
    Io(#[from] std::io::Error),

    #[error("{0}")]
    Json(#[from] serde_json::Error),

    #[error("{0}")]
    Tauri(#[from] tauri::Error),

    #[error("{0}")]
    Custom(String),
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

impl AppError {
    pub fn custom(msg: impl Into<String>) -> Self {
        AppError::Custom(msg.into())
    }
}

impl From<NoteError> for AppError {
    fn from(e: NoteError) -> Self {
        AppError::Custom(e.to_string())
    }
}

impl From<AccountError> for AppError {
    fn from(e: AccountError) -> Self {
        AppError::Custom(e.to_string())
    }
}

impl From<BlobError> for AppError {
    fn from(e: BlobError) -> Self {
        AppError::Custom(e.to_string())
    }
}

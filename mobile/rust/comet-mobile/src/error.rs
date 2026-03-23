use crate::domain::accounts::error::AccountError;
use crate::domain::blob::error::BlobError;
use crate::domain::notes::error::NoteError;

#[derive(Debug, thiserror::Error, uniffi::Error)]
pub enum AppError {
    #[error("{message}")]
    General { message: String },
}

impl AppError {
    pub fn custom(msg: impl Into<String>) -> Self {
        AppError::General {
            message: msg.into(),
        }
    }
}

impl From<rusqlite::Error> for AppError {
    fn from(e: rusqlite::Error) -> Self {
        AppError::General {
            message: e.to_string(),
        }
    }
}

impl From<rusqlite_migration::Error> for AppError {
    fn from(e: rusqlite_migration::Error) -> Self {
        AppError::General {
            message: e.to_string(),
        }
    }
}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        AppError::General {
            message: e.to_string(),
        }
    }
}

impl From<serde_json::Error> for AppError {
    fn from(e: serde_json::Error) -> Self {
        AppError::General {
            message: e.to_string(),
        }
    }
}

impl From<NoteError> for AppError {
    fn from(e: NoteError) -> Self {
        AppError::General {
            message: e.to_string(),
        }
    }
}

impl From<AccountError> for AppError {
    fn from(e: AccountError) -> Self {
        AppError::General {
            message: e.to_string(),
        }
    }
}

impl From<BlobError> for AppError {
    fn from(e: BlobError) -> Self {
        AppError::General {
            message: e.to_string(),
        }
    }
}

impl From<crate::domain::sync::error::SyncError> for AppError {
    fn from(e: crate::domain::sync::error::SyncError) -> Self {
        AppError::General {
            message: e.to_string(),
        }
    }
}

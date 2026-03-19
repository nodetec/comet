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

/// Current time as milliseconds since Unix epoch.
pub fn now_millis() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

/// Current time as seconds since Unix epoch.
pub fn now_secs() -> i64 {
    chrono::Utc::now().timestamp()
}

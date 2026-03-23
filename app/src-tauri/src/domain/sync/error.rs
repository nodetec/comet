#[derive(Debug, thiserror::Error)]
pub enum SyncError {
    #[error("Sync is not configured.")]
    NotConfigured,

    #[error("Keys are locked. Unlock the account to sync.")]
    KeysLocked,

    #[error("Connection failed: {0}")]
    Connection(String),

    #[error("Relay error: {0}")]
    Relay(String),

    #[error("{0}")]
    Storage(String),

    #[error("Shutdown")]
    Shutdown,
}

impl From<rusqlite::Error> for SyncError {
    fn from(e: rusqlite::Error) -> Self {
        SyncError::Storage(e.to_string())
    }
}

impl From<std::io::Error> for SyncError {
    fn from(e: std::io::Error) -> Self {
        SyncError::Storage(e.to_string())
    }
}

#[allow(dead_code)]
#[derive(Debug, thiserror::Error)]
pub enum SyncError {
    #[error("Sync is not configured.")]
    NotConfigured,

    #[error("Keys are locked. Unlock the account to sync.")]
    KeysLocked,

    #[error("Connection failed: {0}")]
    Connection(String),

    #[error("{0}")]
    Storage(String),
}

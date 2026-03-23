#[derive(Debug, thiserror::Error)]
pub enum AccountError {
    #[error("Account not found.")]
    NotFound,

    #[error("{0}")]
    AlreadyExists(String),

    #[error("Account database is missing: {0}")]
    DatabaseMissing(String),

    #[error("No active account configured.")]
    NoActiveAccount,

    #[error("{0}")]
    Storage(String),
}

impl From<rusqlite::Error> for AccountError {
    fn from(e: rusqlite::Error) -> Self {
        AccountError::Storage(e.to_string())
    }
}

impl From<rusqlite_migration::Error> for AccountError {
    fn from(e: rusqlite_migration::Error) -> Self {
        AccountError::Storage(e.to_string())
    }
}

impl From<std::io::Error> for AccountError {
    fn from(e: std::io::Error) -> Self {
        AccountError::Storage(e.to_string())
    }
}

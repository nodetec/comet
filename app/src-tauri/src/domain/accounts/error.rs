#[allow(dead_code)]
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

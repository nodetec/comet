use serde::Serialize;
use std::path::PathBuf;

#[derive(Debug, Clone)]
pub struct IdentityCredentials {
    pub public_key: String,
    pub npub: String,
    pub nsec: String,
}

#[derive(Debug, Clone)]
pub struct AccountRecord {
    pub public_key: String,
    pub npub: String,
    pub db_path: PathBuf,
}

#[derive(Debug, Clone, Serialize, uniffi::Record)]
#[serde(rename_all = "camelCase")]
pub struct AccountSummary {
    pub public_key: String,
    pub npub: String,
    pub is_active: bool,
}

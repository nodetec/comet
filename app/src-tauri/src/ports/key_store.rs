use crate::error::AppError;

#[allow(dead_code)]
/// Abstracts secret key storage and retrieval.
///
/// Currently aspirational — the Tauri adapter doesn't implement this trait
/// yet because `keys_for_current_identity` needs both `AppHandle` and `Connection`.
/// Defined here to document the intended interface for future decoupling.
pub trait KeyStore {
    fn store_nsec(&self, public_key: &str, nsec: &str) -> Result<(), AppError>;
    fn load_nsec(&self, public_key: &str) -> Result<String, AppError>;
    fn remove_nsec(&self, public_key: &str);
    fn is_unlocked(&self, public_key: &str) -> Result<bool, AppError>;
}

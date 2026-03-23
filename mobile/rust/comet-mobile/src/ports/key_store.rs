use crate::error::AppError;
use nostr_sdk::prelude::Keys;

/// Abstracts secret key storage and retrieval.
pub trait KeyStore {
    fn store_nsec(&self, public_key: &str, nsec: &str) -> Result<(), AppError>;
    fn load_nsec(&self, public_key: &str) -> Result<String, AppError>;
    fn remove_nsec(&self, public_key: &str);
    fn is_unlocked(&self, public_key: &str) -> Result<bool, AppError>;
    fn keys_for_account(&self, public_key: &str) -> Result<Keys, AppError>;
}

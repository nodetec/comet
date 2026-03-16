use crate::error::AppError;
use chacha20poly1305::{
    aead::{Aead, AeadCore, KeyInit, OsRng},
    ChaCha20Poly1305, Nonce,
};
use nostr_sdk::prelude::*;
use sha2::{Digest, Sha256};
use std::time::{SystemTime, UNIX_EPOCH};

/// Upload an encrypted blob to a Blossom server.
/// Returns the SHA-256 hash of the ciphertext (the Blossom content address).
pub async fn upload_blob(
    client: &reqwest::Client,
    blossom_url: &str,
    ciphertext: Vec<u8>,
    keys: &Keys,
) -> Result<String, AppError> {
    let mut hasher = Sha256::new();
    hasher.update(&ciphertext);
    let ciphertext_hash = format!("{:x}", hasher.finalize());

    let auth_header = sign_blossom_auth(keys, "upload", &ciphertext_hash, blossom_url)?;

    let url = format!("{}/upload", blossom_url.trim_end_matches('/'));
    let resp = client
        .put(&url)
        .header("Authorization", auth_header)
        .header("Content-Type", "image/png")
        .header("X-SHA-256", &ciphertext_hash)
        .body(ciphertext)
        .send()
        .await
        .map_err(|e| AppError::custom(format!("Blossom upload failed: {e}")))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let reason_header = resp
            .headers()
            .get("x-reason")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("")
            .to_string();
        let body = resp.text().await.unwrap_or_default();
        return Err(AppError::custom(format!("Blossom upload failed ({status}): {reason_header} {body}")));
    }

    Ok(ciphertext_hash)
}

/// Download an encrypted blob from a Blossom server by its ciphertext hash.
pub async fn download_blob(
    client: &reqwest::Client,
    blossom_url: &str,
    ciphertext_hash: &str,
    keys: &Keys,
) -> Result<Vec<u8>, AppError> {
    let auth_header = sign_blossom_auth(keys, "get", ciphertext_hash, blossom_url)?;

    let url = format!("{}/{}", blossom_url.trim_end_matches('/'), ciphertext_hash);
    let resp = client
        .get(&url)
        .header("Authorization", auth_header)
        .send()
        .await
        .map_err(|e| AppError::custom(format!("Blossom download failed: {e}")))?;

    if !resp.status().is_success() {
        let status = resp.status();
        return Err(AppError::custom(format!("Blossom download failed ({status})")));
    }

    resp.bytes()
        .await
        .map(|b| b.to_vec())
        .map_err(|e| AppError::custom(format!("Failed to read blob response: {e}")))
}

// ── Blob encryption ────────────────────────────────────────────────────

/// Encrypt a blob with a random ChaCha20-Poly1305 key.
/// Returns (nonce + ciphertext, key_hex).
pub fn encrypt_blob(plaintext: &[u8]) -> Result<(Vec<u8>, String), AppError> {
    let key = ChaCha20Poly1305::generate_key(&mut OsRng);
    let cipher = ChaCha20Poly1305::new(&key);
    let nonce = ChaCha20Poly1305::generate_nonce(&mut OsRng);

    let ciphertext = cipher
        .encrypt(&nonce, plaintext)
        .map_err(|e| AppError::custom(format!("Encryption failed: {e}")))?;

    let mut result = Vec::with_capacity(12 + ciphertext.len());
    result.extend_from_slice(&nonce);
    result.extend_from_slice(&ciphertext);

    let key_hex = hex::encode(key.as_slice());
    Ok((result, key_hex))
}

/// Decrypt a blob with a ChaCha20-Poly1305 key.
/// Expects nonce (12 bytes) prepended to ciphertext.
pub fn decrypt_blob(data: &[u8], key_hex: &str) -> Result<Vec<u8>, AppError> {
    if data.len() < 12 {
        return Err(AppError::custom("Ciphertext too short"));
    }

    let key_bytes = hex::decode(key_hex).map_err(|e| AppError::custom(format!("Invalid key hex: {e}")))?;
    let cipher = ChaCha20Poly1305::new_from_slice(&key_bytes)
        .map_err(|e| AppError::custom(format!("Failed to create cipher: {e}")))?;

    let nonce = Nonce::from_slice(&data[..12]);
    let ciphertext = &data[12..];

    cipher
        .decrypt(nonce, ciphertext)
        .map_err(|e| AppError::custom(format!("Decryption failed: {e}")))
}

// ── Blossom auth ───────────────────────────────────────────────────────

fn sign_blossom_auth(
    keys: &Keys,
    action: &str,
    blob_hash: &str,
    blossom_url: &str,
) -> Result<String, AppError> {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| AppError::custom(e.to_string()))?
        .as_secs();
    let expiration = now + 300;

    let domain = blossom_url
        .trim_start_matches("https://")
        .trim_start_matches("http://")
        .trim_end_matches('/');

    let event = EventBuilder::new(Kind::Custom(24242), format!("{action} blob"))
        .tags(vec![
            Tag::custom(TagKind::custom("t"), vec![action.to_string()]),
            Tag::custom(TagKind::custom("x"), vec![blob_hash.to_string()]),
            Tag::custom(TagKind::custom("expiration"), vec![expiration.to_string()]),
            Tag::custom(TagKind::custom("server"), vec![domain.to_string()]),
        ])
        .sign_with_keys(keys)
        .map_err(|e| AppError::custom(format!("Failed to sign Blossom auth: {e}")))?;

    let json = event.as_json();
    let encoded = {
        use base64::engine::general_purpose::URL_SAFE_NO_PAD;
        use base64::Engine;
        URL_SAFE_NO_PAD.encode(json.as_bytes())
    };

    Ok(format!("Nostr {encoded}"))
}

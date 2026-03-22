use crate::error::AppError;
use chacha20poly1305::{
    aead::{Aead, AeadCore, KeyInit, OsRng},
    ChaCha20Poly1305, Nonce,
};
use nostr_sdk::prelude::*;
use regex_lite::Regex;
use reqwest::{header::LOCATION, redirect::Policy, Url};
use sha2::{Digest, Sha256};
use tauri::AppHandle;

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

    eprintln!(
        "[blossom] uploading encrypted blob hash={} size={} to {}",
        &ciphertext_hash[..8],
        ciphertext.len(),
        blossom_url
    );

    let auth_header = sign_blossom_auth(keys, "upload", &ciphertext_hash, blossom_url)?;

    let url = format!("{}/upload", blossom_url.trim_end_matches('/'));

    let resp = client
        .put(&url)
        .header("Authorization", auth_header)
        .header("Content-Type", "application/octet-stream")
        .header("X-SHA-256", &ciphertext_hash)
        .body(ciphertext)
        .send()
        .await
        .map_err(|e| {
            eprintln!("[blossom] upload request failed: {e}");
            AppError::custom(format!("Blossom upload failed: {e}"))
        })?;

    if !resp.status().is_success() {
        let status = resp.status();
        let reason_header = resp
            .headers()
            .get("x-reason")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("")
            .to_string();
        let body = resp.text().await.unwrap_or_default();
        eprintln!("[blossom] upload failed ({status}): {reason_header} {body}");
        return Err(AppError::custom(format!(
            "Blossom upload failed ({status}): {reason_header} {body}"
        )));
    }

    eprintln!("[blossom] upload ok hash={}", &ciphertext_hash[..8]);
    Ok(ciphertext_hash)
}

/// Upload a plaintext blob to a Blossom server for public access (publishing).
/// Returns the SHA-256 hash of the plaintext.
pub async fn upload_plaintext_blob(
    client: &reqwest::Client,
    blossom_url: &str,
    data: Vec<u8>,
    ext: &str,
    keys: &Keys,
) -> Result<String, AppError> {
    let mut hasher = Sha256::new();
    hasher.update(&data);
    let hash = format!("{:x}", hasher.finalize());

    let content_type = match ext {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        _ => "application/octet-stream",
    };

    eprintln!(
        "[blossom] uploading plaintext blob hash={} size={} type={} to {}",
        &hash[..8],
        data.len(),
        content_type,
        blossom_url
    );

    let auth_header = sign_blossom_auth(keys, "upload", &hash, blossom_url)?;
    let url = format!("{}/upload", blossom_url.trim_end_matches('/'));

    let resp = client
        .put(&url)
        .header("Authorization", auth_header)
        .header("Content-Type", content_type)
        .header("X-SHA-256", &hash)
        .body(data)
        .send()
        .await
        .map_err(|e| {
            eprintln!("[blossom] plaintext upload request failed: {e}");
            AppError::custom(format!("Blossom upload failed: {e}"))
        })?;

    if !resp.status().is_success() {
        let status = resp.status();
        let reason_header = resp
            .headers()
            .get("x-reason")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("")
            .to_string();
        let body = resp.text().await.unwrap_or_default();
        eprintln!("[blossom] plaintext upload failed ({status}): {reason_header} {body}");
        return Err(AppError::custom(format!(
            "Blossom upload failed ({status}): {reason_header} {body}"
        )));
    }

    Ok(hash)
}

/// Find all `attachment://` URIs in markdown, upload the plaintext blobs to
/// Blossom, and return the markdown with URIs rewritten to public Blossom URLs.
pub async fn upload_and_rewrite_attachments(
    app: &AppHandle,
    blossom_url: &str,
    markdown: &str,
    keys: &Keys,
) -> Result<String, AppError> {
    let re = Regex::new(r"attachment://([a-f0-9]{64})\.(\w+)").unwrap();
    let mut replacements: Vec<(String, String)> = Vec::new();
    let http_client = reqwest::Client::new();

    // Collect unique attachment URIs
    let mut seen = std::collections::HashSet::new();
    for caps in re.captures_iter(markdown) {
        let full_match = caps.get(0).unwrap().as_str().to_string();
        if !seen.insert(full_match.clone()) {
            continue;
        }
        let hash = caps.get(1).unwrap().as_str();
        let ext = caps.get(2).unwrap().as_str();

        let (data, _) = crate::attachments::read_blob(app, hash)?
            .ok_or_else(|| AppError::custom(format!("Local image not found: {hash}.{ext}")))?;

        let size_bytes = data.len() as i64;
        upload_plaintext_blob(&http_client, blossom_url, data, ext, keys).await?;

        // Record the upload
        let conn = crate::db::database_connection(app)?;
        conn.execute(
            "INSERT OR REPLACE INTO blob_uploads (hash, server_url, encrypted, size_bytes, uploaded_at) VALUES (?1, ?2, 0, ?3, ?4)",
            rusqlite::params![hash, blossom_url, size_bytes, crate::error::now_millis()],
        )?;

        let public_url = format!("{}/{}.{}", blossom_url.trim_end_matches('/'), hash, ext);
        replacements.push((full_match, public_url));
    }

    let mut result = markdown.to_string();
    for (from, to) in replacements {
        result = result.replace(&from, &to);
    }
    Ok(result)
}

/// Delete a blob from a Blossom server by its hash.
pub async fn delete_blob(
    client: &reqwest::Client,
    blossom_url: &str,
    hash: &str,
    keys: &Keys,
) -> Result<(), AppError> {
    eprintln!(
        "[blossom] deleting hash={} from {}",
        &hash[..8.min(hash.len())],
        blossom_url
    );
    let auth_header = sign_blossom_auth(keys, "delete", hash, blossom_url)?;
    let url = format!("{}/{}", blossom_url.trim_end_matches('/'), hash);

    let resp = client
        .delete(&url)
        .header("Authorization", auth_header)
        .send()
        .await
        .map_err(|e| {
            eprintln!("[blossom] delete request failed: {e}");
            AppError::custom(format!("Blossom delete failed: {e}"))
        })?;

    if !resp.status().is_success() && resp.status().as_u16() != 404 {
        let status = resp.status();
        eprintln!(
            "[blossom] delete failed ({status}) for hash={}",
            &hash[..8.min(hash.len())]
        );
        return Err(AppError::custom(format!(
            "Blossom delete failed ({status})"
        )));
    }

    eprintln!("[blossom] delete ok hash={}", &hash[..8.min(hash.len())]);
    Ok(())
}

/// Download an encrypted blob from a Blossom server by its ciphertext hash.
pub async fn download_blob(
    client: &reqwest::Client,
    blossom_url: &str,
    ciphertext_hash: &str,
    keys: &Keys,
) -> Result<Vec<u8>, AppError> {
    eprintln!(
        "[blossom] downloading hash={} from {}",
        &ciphertext_hash[..8],
        blossom_url
    );
    let auth_header = sign_blossom_auth(keys, "get", ciphertext_hash, blossom_url)?;

    let url = format!("{}/{}", blossom_url.trim_end_matches('/'), ciphertext_hash);
    let request_client = reqwest::Client::builder()
        .redirect(Policy::none())
        .build()
        .map_err(|e| AppError::custom(format!("Failed to prepare Blossom client: {e}")))?;

    let resp = request_client
        .get(&url)
        .header("Authorization", auth_header)
        .send()
        .await
        .map_err(|e| {
            eprintln!("[blossom] download request failed: {e}");
            AppError::custom(format!("Blossom download failed: {e}"))
        })?;

    let resp = if resp.status().is_redirection() {
        let location = resp
            .headers()
            .get(LOCATION)
            .and_then(|value| value.to_str().ok())
            .ok_or_else(|| AppError::custom("Blossom download redirect missing location."))?;
        let redirect_url = Url::parse(location)
            .or_else(|_| Url::parse(&url).and_then(|base| base.join(location)))
            .map_err(|e| AppError::custom(format!("Invalid Blossom redirect URL: {e}")))?;

        client.get(redirect_url).send().await.map_err(|e| {
            eprintln!("[blossom] redirected download request failed: {e}");
            AppError::custom(format!("Blossom download failed: {e}"))
        })?
    } else {
        resp
    };

    if !resp.status().is_success() {
        let status = resp.status();
        eprintln!(
            "[blossom] download failed ({status}) for hash={}",
            &ciphertext_hash[..8]
        );
        return Err(AppError::custom(format!(
            "Blossom download failed ({status})"
        )));
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

    let key_bytes =
        hex::decode(key_hex).map_err(|e| AppError::custom(format!("Invalid key hex: {e}")))?;
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
    let now = crate::error::now_secs() as u64;
    let expiration = now + 300;

    let domain = url::Url::parse(blossom_url)
        .ok()
        .and_then(|u| u.host_str().map(String::from))
        .unwrap_or_else(|| blossom_url.to_string());

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

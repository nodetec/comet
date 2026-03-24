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

fn short_hash(hash: &str) -> &str {
    &hash[..8.min(hash.len())]
}

fn blossom_log(message: &str) {
    eprintln!("[blossom] {message}");
}

/// Upload an encrypted blob to a Blossom server.
/// Returns the SHA-256 hash of the ciphertext.
pub async fn upload_blob(
    client: &reqwest::Client,
    blossom_url: &str,
    ciphertext: Vec<u8>,
    keys: &Keys,
) -> Result<String, AppError> {
    let mut hasher = Sha256::new();
    hasher.update(&ciphertext);
    let ciphertext_hash = format!("{:x}", hasher.finalize());

    blossom_log(&format!(
        "encrypted upload start ciphertext_hash={} size={} url={}",
        short_hash(&ciphertext_hash),
        ciphertext.len(),
        blossom_url
    ));

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
            blossom_log(&format!(
                "encrypted upload request failed ciphertext_hash={} error={e}",
                short_hash(&ciphertext_hash)
            ));
            AppError::custom(format!("Blossom upload failed: {e}"))
        })?;

    blossom_log(&format!(
        "encrypted upload response ciphertext_hash={} status={}",
        short_hash(&ciphertext_hash),
        resp.status()
    ));

    if !resp.status().is_success() {
        let status = resp.status();
        let reason_header = resp
            .headers()
            .get("x-reason")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("")
            .to_string();
        let body = resp.text().await.unwrap_or_default();
        blossom_log(&format!(
            "encrypted upload failed ciphertext_hash={} status={} reason_header={} body={}",
            short_hash(&ciphertext_hash),
            status,
            reason_header,
            body
        ));
        return Err(AppError::custom(format!(
            "Blossom upload failed ({status}): {reason_header} {body}"
        )));
    }

    blossom_log(&format!(
        "encrypted upload ok ciphertext_hash={}",
        short_hash(&ciphertext_hash)
    ));
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

    blossom_log(&format!(
        "plaintext upload start plaintext_hash={} size={} type={} url={}",
        short_hash(&hash),
        data.len(),
        content_type,
        blossom_url
    ));

    let auth_header = sign_blossom_auth(keys, "upload", &hash, blossom_url)?;
    let url = format!("{}/upload", blossom_url.trim_end_matches('/'));
    blossom_log(&format!(
        "plaintext upload request prepared plaintext_hash={} endpoint={} auth_bytes={}",
        short_hash(&hash),
        url,
        auth_header.len()
    ));

    let resp = client
        .put(&url)
        .header("Authorization", auth_header)
        .header("Content-Type", content_type)
        .header("X-SHA-256", &hash)
        .body(data)
        .send()
        .await
        .map_err(|e| {
            blossom_log(&format!(
                "plaintext upload request failed plaintext_hash={} error={e}",
                short_hash(&hash)
            ));
            AppError::custom(format!("Blossom upload failed: {e}"))
        })?;

    blossom_log(&format!(
        "plaintext upload response plaintext_hash={} status={}",
        short_hash(&hash),
        resp.status()
    ));

    if !resp.status().is_success() {
        let status = resp.status();
        let reason_header = resp
            .headers()
            .get("x-reason")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("")
            .to_string();
        let body = resp.text().await.unwrap_or_default();
        blossom_log(&format!(
            "plaintext upload failed plaintext_hash={} status={} reason_header={} body={}",
            short_hash(&hash),
            status,
            reason_header,
            body
        ));
        return Err(AppError::custom(format!(
            "Blossom upload failed ({status}): {reason_header} {body}"
        )));
    }

    blossom_log(&format!(
        "plaintext upload ok plaintext_hash={}",
        short_hash(&hash)
    ));

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
    blossom_log(&format!(
        "rewrite attachments start url={} markdown_bytes={}",
        blossom_url,
        markdown.len()
    ));

    // Collect unique attachment URIs
    let mut seen = std::collections::HashSet::new();
    for caps in re.captures_iter(markdown) {
        let full_match = caps.get(0).unwrap().as_str().to_string();
        if !seen.insert(full_match.clone()) {
            continue;
        }
        let hash = caps.get(1).unwrap().as_str();
        let ext = caps.get(2).unwrap().as_str();
        blossom_log(&format!(
            "rewrite attachment found hash={} ext={}",
            short_hash(hash),
            ext
        ));

        let (data, _) = crate::adapters::filesystem::attachments::read_blob(app, hash)?
            .ok_or_else(|| AppError::custom(format!("Local image not found: {hash}.{ext}")))?;
        blossom_log(&format!(
            "rewrite attachment loaded hash={} bytes={}",
            short_hash(hash),
            data.len()
        ));

        let size_bytes = data.len() as i64;
        upload_plaintext_blob(&http_client, blossom_url, data, ext, keys).await?;

        // Record the upload
        let conn = crate::db::database_connection(app)?;
        conn.execute(
            "INSERT OR REPLACE INTO blob_uploads (hash, server_url, encrypted, size_bytes, uploaded_at) VALUES (?1, ?2, 0, ?3, ?4)",
            rusqlite::params![hash, blossom_url, size_bytes, crate::domain::common::time::now_millis()],
        )?;
        blossom_log(&format!(
            "rewrite attachment recorded hash={} size_bytes={} server_url={}",
            short_hash(hash),
            size_bytes,
            blossom_url
        ));

        let public_url = format!("{}/{}.{}", blossom_url.trim_end_matches('/'), hash, ext);
        replacements.push((full_match, public_url));
    }

    let mut result = markdown.to_string();
    for (from, to) in replacements {
        result = result.replace(&from, &to);
    }
    blossom_log(&format!(
        "rewrite attachments complete replacements={} url={}",
        seen.len(),
        blossom_url
    ));
    Ok(result)
}

/// Delete a stored Blossom object by its server object hash.
///
/// Revision-sync uploads delete by ciphertext hash. Public publish flows may
/// delete by plaintext hash instead.
pub async fn delete_blob(
    client: &reqwest::Client,
    blossom_url: &str,
    object_hash: &str,
    keys: &Keys,
) -> Result<(), AppError> {
    blossom_log(&format!(
        "delete start object_hash={} url={}",
        short_hash(object_hash),
        blossom_url
    ));
    let auth_header = sign_blossom_auth(keys, "delete", object_hash, blossom_url)?;
    let url = format!("{}/{}", blossom_url.trim_end_matches('/'), object_hash);

    let resp = client
        .delete(&url)
        .header("Authorization", auth_header)
        .send()
        .await
        .map_err(|e| {
            blossom_log(&format!(
                "delete request failed object_hash={} error={e}",
                short_hash(object_hash)
            ));
            AppError::custom(format!("Blossom delete failed: {e}"))
        })?;

    if !resp.status().is_success() && resp.status().as_u16() != 404 {
        let status = resp.status();
        blossom_log(&format!(
            "delete failed object_hash={} status={status}",
            short_hash(object_hash)
        ));
        return Err(AppError::custom(format!(
            "Blossom delete failed ({status})"
        )));
    }

    blossom_log(&format!(
        "delete ok object_hash={}",
        short_hash(object_hash)
    ));
    Ok(())
}

/// Download an encrypted blob from a Blossom server by its ciphertext hash.
pub async fn download_blob(
    client: &reqwest::Client,
    blossom_url: &str,
    ciphertext_hash: &str,
    keys: &Keys,
) -> Result<Vec<u8>, AppError> {
    blossom_log(&format!(
        "download start ciphertext_hash={} url={}",
        short_hash(ciphertext_hash),
        blossom_url
    ));
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
            blossom_log(&format!(
                "download request failed ciphertext_hash={} error={e}",
                short_hash(ciphertext_hash)
            ));
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
        blossom_log(&format!(
            "download redirect ciphertext_hash={} location={}",
            short_hash(ciphertext_hash),
            redirect_url
        ));

        client.get(redirect_url).send().await.map_err(|e| {
            blossom_log(&format!(
                "download redirect failed ciphertext_hash={} error={e}",
                short_hash(ciphertext_hash)
            ));
            AppError::custom(format!("Blossom download failed: {e}"))
        })?
    } else {
        blossom_log(&format!(
            "download direct response ciphertext_hash={} status={}",
            short_hash(ciphertext_hash),
            resp.status()
        ));
        resp
    };

    if !resp.status().is_success() {
        let status = resp.status();
        blossom_log(&format!(
            "download failed ciphertext_hash={} status={status}",
            short_hash(ciphertext_hash)
        ));
        return Err(AppError::custom(format!(
            "Blossom download failed ({status})"
        )));
    }

    let bytes = resp
        .bytes()
        .await
        .map(|b| b.to_vec())
        .map_err(|e| AppError::custom(format!("Failed to read blob response: {e}")))?;
    blossom_log(&format!(
        "download ok ciphertext_hash={} bytes={}",
        short_hash(ciphertext_hash),
        bytes.len()
    ));
    Ok(bytes)
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

    Ok((result, hex::encode(key.as_slice())))
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
    let now = crate::domain::common::time::now_secs() as u64;
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
            Tag::custom(TagKind::custom("server"), vec![domain.clone()]),
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

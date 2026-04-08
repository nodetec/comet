use crate::error::AppError;
use chacha20poly1305::{
    aead::{Aead, AeadCore, KeyInit, OsRng},
    ChaCha20Poly1305, Nonce,
};
use nostr_sdk::prelude::*;
use reqwest::{header::LOCATION, redirect::Policy, Url};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

fn short_hash(hash: &str) -> &str {
    &hash[..8.min(hash.len())]
}

fn blossom_log(message: &str) {
    eprintln!("[blossom] {message}");
}

#[derive(Debug)]
pub struct BlossomBatchUploadItem {
    pub part: String,
    pub ciphertext_hash: String,
    pub ciphertext: Vec<u8>,
    pub content_type: String,
}

#[derive(Debug)]
pub struct BlossomBatchUploadResult {
    pub part: String,
    pub status: u16,
    pub error: Option<String>,
}

#[derive(Serialize)]
struct BlossomBatchUploadManifestItem<'a> {
    part: &'a str,
    sha256: &'a str,
    size: usize,
    #[serde(rename = "type")]
    content_type: &'a str,
    filename: String,
}

#[derive(Serialize)]
struct BlossomBatchUploadManifest<'a> {
    uploads: Vec<BlossomBatchUploadManifestItem<'a>>,
}

#[derive(Deserialize)]
struct BlossomBatchUploadResponse {
    results: Vec<BlossomBatchUploadResponseItem>,
}

#[derive(Deserialize)]
struct BlossomBatchUploadResponseItem {
    part: String,
    status: u16,
    error: Option<String>,
}

/// Upload an encrypted blob to a Blossom server.
/// Returns the SHA-256 hash of the ciphertext.
pub async fn upload_blob(
    client: &reqwest::Client,
    blossom_url: &str,
    ciphertext: Vec<u8>,
    keys: &Keys,
    access_key: Option<&str>,
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

    let mut request = client
        .put(&url)
        .header("Authorization", auth_header)
        .header("Content-Type", "application/octet-stream")
        .header("X-SHA-256", &ciphertext_hash);
    if let Some(key) = access_key {
        request = request.header("X-Access-Key", key);
    }
    let resp = request.body(ciphertext).send().await.map_err(|e| {
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

pub async fn upload_blobs_batch(
    client: &reqwest::Client,
    blossom_url: &str,
    uploads: &[BlossomBatchUploadItem],
    keys: &Keys,
    access_key: Option<&str>,
) -> Result<Vec<BlossomBatchUploadResult>, AppError> {
    if uploads.is_empty() {
        return Ok(Vec::new());
    }

    blossom_log(&format!(
        "encrypted batch upload start blobs={} url={}",
        uploads.len(),
        blossom_url
    ));

    let hashes = uploads
        .iter()
        .map(|upload| upload.ciphertext_hash.clone())
        .collect::<Vec<_>>();
    let auth_header = sign_blossom_auth_hashes(keys, "upload", &hashes, blossom_url)?;
    let boundary = format!(
        "comet-blossom-{}",
        crate::domain::common::time::now_millis()
    );
    let manifest = BlossomBatchUploadManifest {
        uploads: uploads
            .iter()
            .map(|upload| BlossomBatchUploadManifestItem {
                part: &upload.part,
                sha256: &upload.ciphertext_hash,
                size: upload.ciphertext.len(),
                content_type: &upload.content_type,
                filename: format!("{}.bin", upload.part),
            })
            .collect(),
    };
    let manifest_json = serde_json::to_string(&manifest)
        .map_err(|e| AppError::custom(format!("Failed to encode Blossom batch manifest: {e}")))?;

    let mut body = Vec::new();
    append_multipart_text_part(&mut body, &boundary, "manifest", &manifest_json);
    for upload in uploads {
        append_multipart_file_part(
            &mut body,
            &boundary,
            &upload.part,
            &format!("{}.bin", upload.part),
            &upload.content_type,
            &upload.ciphertext,
        );
    }
    body.extend_from_slice(format!("--{boundary}--\r\n").as_bytes());

    let url = format!("{}/upload-batch", blossom_url.trim_end_matches('/'));
    let mut request = client
        .post(&url)
        .header("Authorization", auth_header)
        .header(
            "Content-Type",
            format!("multipart/form-data; boundary={boundary}"),
        );
    if let Some(key) = access_key {
        request = request.header("X-Access-Key", key);
    }
    let resp = request.body(body).send().await.map_err(|e| {
        blossom_log(&format!("encrypted batch upload request failed error={e}"));
        AppError::custom(format!("Blossom batch upload failed: {e}"))
    })?;

    blossom_log(&format!(
        "encrypted batch upload response status={}",
        resp.status()
    ));

    if matches!(resp.status().as_u16(), 404 | 405 | 501) {
        return Err(AppError::custom(format!(
            "Blossom batch upload unsupported ({})",
            resp.status()
        )));
    }

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        blossom_log(&format!(
            "encrypted batch upload failed status={} body={}",
            status, body
        ));
        return Err(AppError::custom(format!(
            "Blossom batch upload failed ({status}): {body}"
        )));
    }

    let response_body = resp.text().await.map_err(|e| {
        AppError::custom(format!("Failed to read Blossom batch upload response: {e}"))
    })?;
    let payload: BlossomBatchUploadResponse =
        serde_json::from_str(&response_body).map_err(|e| {
            AppError::custom(format!(
                "Failed to parse Blossom batch upload response: {e}"
            ))
        })?;

    let results = payload
        .results
        .into_iter()
        .map(|result| BlossomBatchUploadResult {
            part: result.part,
            status: result.status,
            error: result.error,
        })
        .collect::<Vec<_>>();

    blossom_log(&format!(
        "encrypted batch upload ok blobs={} statuses={}",
        results.len(),
        results
            .iter()
            .map(|result| result.status.to_string())
            .collect::<Vec<_>>()
            .join(",")
    ));

    Ok(results)
}

pub async fn blob_exists(
    client: &reqwest::Client,
    blossom_url: &str,
    ciphertext_hash: &str,
    keys: &Keys,
) -> Result<bool, AppError> {
    blossom_log(&format!(
        "exists check start ciphertext_hash={} url={}",
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
        .map_err(|e| AppError::custom(format!("Blossom exists check failed: {e}")))?;

    if resp.status().is_success() {
        blossom_log(&format!(
            "exists check direct ok ciphertext_hash={} status={}",
            short_hash(ciphertext_hash),
            resp.status()
        ));
        return Ok(true);
    }

    if !resp.status().is_redirection() {
        blossom_log(&format!(
            "exists check direct miss ciphertext_hash={} status={}",
            short_hash(ciphertext_hash),
            resp.status()
        ));
        return Ok(false);
    }

    let location = resp
        .headers()
        .get(LOCATION)
        .and_then(|value| value.to_str().ok())
        .ok_or_else(|| AppError::custom("Blossom exists redirect missing location."))?;
    let redirect_url = Url::parse(location)
        .or_else(|_| Url::parse(&url).and_then(|base| base.join(location)))
        .map_err(|e| AppError::custom(format!("Invalid Blossom redirect URL: {e}")))?;

    let redirect_resp = client
        .head(redirect_url.clone())
        .send()
        .await
        .map_err(|e| AppError::custom(format!("Blossom exists redirect check failed: {e}")))?;

    blossom_log(&format!(
        "exists check redirect ciphertext_hash={} location={} status={}",
        short_hash(ciphertext_hash),
        redirect_url,
        redirect_resp.status()
    ));

    Ok(redirect_resp.status().is_success())
}

/// Delete a stored Blossom object by its server object hash.
///
/// For Comet's current encrypted attachment flow, this is the ciphertext hash.
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
    sign_blossom_auth_hashes(keys, action, &[blob_hash.to_string()], blossom_url)
}

fn sign_blossom_auth_hashes(
    keys: &Keys,
    action: &str,
    blob_hashes: &[String],
    blossom_url: &str,
) -> Result<String, AppError> {
    let now = crate::domain::common::time::now_secs() as u64;
    let expiration = now + 300;

    let domain = url::Url::parse(blossom_url)
        .ok()
        .and_then(|u| u.host_str().map(String::from))
        .unwrap_or_else(|| blossom_url.to_string());

    let mut tags = vec![
        Tag::custom(TagKind::custom("t"), vec![action.to_string()]),
        Tag::custom(TagKind::custom("expiration"), vec![expiration.to_string()]),
        Tag::custom(TagKind::custom("server"), vec![domain.clone()]),
    ];
    for blob_hash in blob_hashes {
        tags.push(Tag::custom(
            TagKind::custom("x"),
            vec![blob_hash.to_string()],
        ));
    }

    let event = EventBuilder::new(Kind::Custom(24242), format!("{action} blob"))
        .tags(tags)
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

fn append_multipart_text_part(body: &mut Vec<u8>, boundary: &str, name: &str, value: &str) {
    body.extend_from_slice(format!("--{boundary}\r\n").as_bytes());
    body.extend_from_slice(
        format!("Content-Disposition: form-data; name=\"{name}\"\r\n\r\n").as_bytes(),
    );
    body.extend_from_slice(value.as_bytes());
    body.extend_from_slice(b"\r\n");
}

fn append_multipart_file_part(
    body: &mut Vec<u8>,
    boundary: &str,
    name: &str,
    filename: &str,
    content_type: &str,
    bytes: &[u8],
) {
    body.extend_from_slice(format!("--{boundary}\r\n").as_bytes());
    body.extend_from_slice(
        format!("Content-Disposition: form-data; name=\"{name}\"; filename=\"{filename}\"\r\n")
            .as_bytes(),
    );
    body.extend_from_slice(format!("Content-Type: {content_type}\r\n\r\n").as_bytes());
    body.extend_from_slice(bytes);
    body.extend_from_slice(b"\r\n");
}

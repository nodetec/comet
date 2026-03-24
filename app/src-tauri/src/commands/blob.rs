use crate::db::database_connection;
use crate::error::AppError;
use rusqlite::OptionalExtension;
use serde::Serialize;
use tauri::AppHandle;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub enum BlobFetchStatus {
    Downloaded,
    Missing,
    NeedsUnlock,
}

#[tauri::command]
pub fn get_blossom_url(app: AppHandle) -> Result<Option<String>, AppError> {
    let conn = database_connection(&app)?;
    Ok(crate::adapters::sqlite::sync_repository::get_blossom_url(
        &conn,
    ))
}

#[tauri::command]
pub fn set_blossom_url(app: AppHandle, url: String) -> Result<(), AppError> {
    let parsed =
        url::Url::parse(url.trim()).map_err(|_| AppError::custom("Invalid Blossom URL"))?;
    match parsed.scheme() {
        "https" | "http" => {}
        _ => {
            return Err(AppError::custom(
                "Blossom URL must start with https:// or http://",
            ))
        }
    }
    let url = parsed.as_str().trim_end_matches('/').to_string();
    let conn = database_connection(&app)?;
    conn.execute(
        "INSERT OR REPLACE INTO app_settings (key, value) VALUES ('blossom_url', ?1)",
        rusqlite::params![url],
    )?;
    Ok(())
}

#[tauri::command]
pub fn remove_blossom_url(app: AppHandle) -> Result<(), AppError> {
    let conn = database_connection(&app)?;
    conn.execute("DELETE FROM app_settings WHERE key = 'blossom_url'", [])?;
    Ok(())
}

#[tauri::command]
pub async fn fetch_blob(app: AppHandle, hash: String) -> Result<BlobFetchStatus, AppError> {
    log::info!("[blob] fetch requested plaintext_hash={hash}");

    if crate::adapters::filesystem::attachments::has_local_blob(&app, &hash)? {
        log::info!("[blob] already local plaintext_hash={hash}");
        return Ok(BlobFetchStatus::Downloaded);
    }

    let conn = database_connection(&app)?;
    let preferred_blossom_url = crate::adapters::sqlite::sync_repository::get_blossom_url(&conn);
    log::info!(
        "[blob] lookup plaintext_hash={hash} preferred_blossom_url={preferred_blossom_url:?}"
    );

    if !crate::adapters::tauri::key_store::is_current_identity_unlocked(&app, &conn)? {
        log::info!("[blob] needs unlock plaintext_hash={hash}");
        return Ok(BlobFetchStatus::NeedsUnlock);
    }

    let (keys, pubkey_hex) =
        crate::adapters::tauri::key_store::keys_for_current_identity(&app, &conn)?;
    log::info!("[blob] resolved account plaintext_hash={hash} pubkey={pubkey_hex}");

    let meta: Option<(String, String, String)> =
        if let Some(ref blossom_url) = preferred_blossom_url {
            conn.query_row(
                "SELECT server_url, ciphertext_hash, encryption_key
             FROM blob_meta
             WHERE plaintext_hash = ?1 AND pubkey = ?2
             ORDER BY CASE WHEN server_url = ?3 THEN 0 ELSE 1 END, rowid DESC
             LIMIT 1",
                rusqlite::params![hash, pubkey_hex, blossom_url],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .optional()?
        } else {
            conn.query_row(
                "SELECT server_url, ciphertext_hash, encryption_key
             FROM blob_meta
             WHERE plaintext_hash = ?1 AND pubkey = ?2
             ORDER BY rowid DESC
             LIMIT 1",
                rusqlite::params![hash, pubkey_hex],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .optional()?
        };

    let (server_url, ciphertext_hash, key_hex) = match meta {
        Some(m) => m,
        None => {
            log::warn!("[blob] missing metadata plaintext_hash={hash} pubkey={pubkey_hex}");
            return Ok(BlobFetchStatus::Missing);
        }
    };

    log::info!(
        "[blob] metadata found plaintext_hash={} ciphertext_hash={} server_url={} key_len={}",
        hash,
        ciphertext_hash,
        server_url,
        key_hex.len()
    );

    drop(conn);

    let http_client = reqwest::Client::new();
    let ciphertext = crate::adapters::blossom::client::download_blob(
        &http_client,
        &server_url,
        &ciphertext_hash,
        &keys,
    )
    .await?;
    log::info!(
        "[blob] downloaded ciphertext plaintext_hash={} ciphertext_hash={} size={}",
        hash,
        ciphertext_hash,
        ciphertext.len()
    );

    let plaintext = crate::adapters::blossom::client::decrypt_blob(&ciphertext, &key_hex)?;
    log::info!(
        "[blob] decrypted plaintext_hash={} size={}",
        hash,
        plaintext.len()
    );

    let conn2 = database_connection(&app)?;
    let ext: String = conn2
        .query_row(
            "SELECT markdown FROM notes WHERE markdown LIKE ?1 LIMIT 1",
            rusqlite::params![format!("%attachment://{}%", hash)],
            |row| row.get::<_, String>(0),
        )
        .optional()?
        .and_then(|md| crate::domain::blob::service::extract_blob_extension(&md, &hash))
        .unwrap_or_else(|| "bin".to_string());
    log::info!("[blob] resolved extension plaintext_hash={hash} ext={ext}");

    crate::adapters::filesystem::attachments::save_blob(&app, &hash, &ext, &plaintext)?;
    log::info!("[blob] saved locally plaintext_hash={hash} ext={ext}");
    Ok(BlobFetchStatus::Downloaded)
}

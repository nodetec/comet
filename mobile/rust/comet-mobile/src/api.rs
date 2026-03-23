use crate::adapters::mobile::key_store::UnlockedNostrKeys;
use crate::adapters::nostr::sync_manager::SyncManager;
use crate::adapters::sqlite::note_repository::SqliteNoteRepository;
use crate::app_state::{AppState, EventEmitter, APP_STATE};
use crate::db;
use crate::domain::accounts::model::AccountSummary;
use crate::domain::common::time::now_millis;
use crate::domain::notes::model::*;
use crate::domain::notes::service::NoteService;
use crate::domain::relay::model::Relay;
use crate::domain::sync::model::{SyncCommand, SyncState};
use crate::error::AppError;
use crate::infra::cache::RenderedHtmlCache;
use crate::ports::note_repository::NoteRepository;
use std::sync::{Arc, Mutex};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn state() -> &'static Arc<AppState> {
    crate::app_state::state()
}

fn sync_push(cmd: SyncCommand) {
    let manager = state().sync_manager.clone();
    tokio::spawn(async move {
        manager.push(cmd).await;
    });
}

fn record_to_loaded_note(
    record: crate::ports::note_repository::NoteRecord,
    repo: &SqliteNoteRepository,
) -> Result<LoadedNote, AppError> {
    let tags = repo.tags_for_note(&record.id)?;
    Ok(LoadedNote {
        id: record.id,
        title: record.title,
        notebook: record
            .notebook_id
            .zip(record.notebook_name)
            .map(|(id, name)| NotebookRef { id, name }),
        modified_at: record.modified_at,
        markdown: record.markdown,
        archived_at: record.archived_at,
        deleted_at: record.deleted_at,
        pinned_at: record.pinned_at,
        readonly: record.readonly,
        tags,
        nostr_d_tag: record.nostr_d_tag,
        published_at: record.published_at,
        published_kind: record.published_kind,
    })
}

fn spawn_blossom_deletions(blossom_deletions: Vec<(String, String)>) {
    if blossom_deletions.is_empty() {
        return;
    }
    let s = state().clone();
    tokio::spawn(async move {
        let conn = match db::database_connection(&s) {
            Ok(c) => c,
            Err(_) => return,
        };
        let (keys, _) =
            match crate::adapters::mobile::key_store::keys_for_current_identity(&s, &conn) {
                Ok(identity) => identity,
                Err(_) => return,
            };
        drop(conn);

        let client = reqwest::Client::new();
        for (server_url, ciphertext_hash) in blossom_deletions {
            if let Err(e) = crate::adapters::blossom::client::delete_blob(
                &client,
                &server_url,
                &ciphertext_hash,
                &keys,
            )
            .await
            {
                log::error!("[blob-gc] failed to delete from Blossom: {e}");
            }
        }
    });
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

#[uniffi::export]
pub fn init_app(
    base_dir: String,
    event_emitter: Option<Box<dyn EventEmitter>>,
) -> Result<(), AppError> {
    rustls::crypto::ring::default_provider()
        .install_default()
        .ok();

    let app_state = Arc::new(AppState {
        base_dir: std::path::PathBuf::from(&base_dir),
        html_cache: RenderedHtmlCache::default(),
        unlocked_keys: UnlockedNostrKeys::default(),
        sync_manager: SyncManager::new(),
        event_emitter: Mutex::new(event_emitter.map(|e| Arc::from(e) as Arc<dyn EventEmitter>)),
    });

    APP_STATE
        .set(app_state.clone())
        .map_err(|_| AppError::custom("App already initialized"))?;

    db::init_database(&app_state)?;

    // Auto-start sync in background
    let s = app_state.clone();
    tokio::spawn(async move {
        crate::adapters::nostr::sync_manager::auto_start(s).await;
    });

    Ok(())
}

// ---------------------------------------------------------------------------
// Notes — queries
// ---------------------------------------------------------------------------

#[uniffi::export]
pub fn bootstrap() -> Result<BootstrapPayload, AppError> {
    let s = state();
    let conn = db::database_connection(s)?;
    let repo = SqliteNoteRepository::new(&conn);
    Ok(NoteService::bootstrap(&repo)?)
}

#[uniffi::export]
pub fn todo_count() -> Result<i64, AppError> {
    let s = state();
    let conn = db::database_connection(s)?;
    let repo = SqliteNoteRepository::new(&conn);
    Ok(NoteService::todo_count(&repo)?)
}

#[uniffi::export]
pub fn query_notes(input: NoteQueryInput) -> Result<NotePagePayload, AppError> {
    let s = state();
    let conn = db::database_connection(s)?;
    let repo = SqliteNoteRepository::new(&conn);
    Ok(NoteService::query_notes(&repo, input)?)
}

#[uniffi::export]
pub fn contextual_tags(input: ContextualTagsInput) -> Result<ContextualTagsPayload, AppError> {
    let s = state();
    let conn = db::database_connection(s)?;
    let repo = SqliteNoteRepository::new(&conn);
    Ok(NoteService::contextual_tags(&repo, input)?)
}

#[uniffi::export]
pub fn load_note(note_id: String) -> Result<LoadedNote, AppError> {
    let s = state();
    let conn = db::database_connection(s)?;
    let repo = SqliteNoteRepository::new(&conn);
    let record = NoteService::load_note(&repo, &note_id)?;
    record_to_loaded_note(record, &repo)
}

#[uniffi::export]
pub fn search_notes(query: String) -> Result<Vec<SearchResult>, AppError> {
    let s = state();
    let conn = db::database_connection(s)?;
    let repo = SqliteNoteRepository::new(&conn);
    Ok(NoteService::search_notes(&repo, &query)?)
}

#[uniffi::export]
pub fn search_tags(query: String) -> Result<Vec<String>, AppError> {
    let s = state();
    let conn = db::database_connection(s)?;
    let repo = SqliteNoteRepository::new(&conn);
    Ok(NoteService::search_tags(&repo, &query)?)
}

// ---------------------------------------------------------------------------
// Notes — mutations
// ---------------------------------------------------------------------------

#[uniffi::export]
pub fn create_note(
    notebook_id: Option<String>,
    tags: Vec<String>,
    markdown: Option<String>,
) -> Result<LoadedNote, AppError> {
    let s = state();
    let conn = db::database_connection(s)?;
    let repo = SqliteNoteRepository::new(&conn);
    let record =
        NoteService::create_note(&repo, notebook_id.as_deref(), &tags, markdown.as_deref())?;
    record_to_loaded_note(record, &repo)
}

#[uniffi::export]
pub fn duplicate_note(note_id: String) -> Result<LoadedNote, AppError> {
    let s = state();
    let conn = db::database_connection(s)?;
    let repo = SqliteNoteRepository::new(&conn);
    let record = NoteService::duplicate_note(&repo, &note_id)?;
    let note = record_to_loaded_note(record, &repo)?;
    sync_push(SyncCommand::PushNote(note.id.clone()));
    Ok(note)
}

#[uniffi::export]
pub fn save_note(input: SaveNoteInput) -> Result<LoadedNote, AppError> {
    let note_id = input.id.clone();
    let s = state();
    let conn = db::database_connection(s)?;
    let repo = SqliteNoteRepository::new(&conn);
    let (record, content_changed) = NoteService::save_note(&repo, input)?;
    let note = record_to_loaded_note(record, &repo)?;
    if content_changed {
        sync_push(SyncCommand::PushNote(note_id));
    }
    Ok(note)
}

#[uniffi::export]
pub fn set_note_readonly(input: SetNoteReadonlyInput) -> Result<LoadedNote, AppError> {
    let note_id = input.note_id.clone();
    let s = state();
    let conn = db::database_connection(s)?;
    let repo = SqliteNoteRepository::new(&conn);
    let record = NoteService::set_readonly(&repo, input)?;
    let note = record_to_loaded_note(record, &repo)?;
    sync_push(SyncCommand::PushNote(note_id));
    Ok(note)
}

#[uniffi::export]
pub fn archive_note(note_id: String) -> Result<LoadedNote, AppError> {
    let s = state();
    let conn = db::database_connection(s)?;
    let repo = SqliteNoteRepository::new(&conn);
    let record = NoteService::archive_note(&repo, &note_id)?;
    let note = record_to_loaded_note(record, &repo)?;
    sync_push(SyncCommand::PushNote(note_id));
    Ok(note)
}

#[uniffi::export]
pub fn restore_note(note_id: String) -> Result<LoadedNote, AppError> {
    let s = state();
    let conn = db::database_connection(s)?;
    let repo = SqliteNoteRepository::new(&conn);
    let record = NoteService::restore_note(&repo, &note_id)?;
    let note = record_to_loaded_note(record, &repo)?;
    sync_push(SyncCommand::PushNote(note_id));
    Ok(note)
}

#[uniffi::export]
pub fn trash_note(note_id: String) -> Result<LoadedNote, AppError> {
    let s = state();
    let conn = db::database_connection(s)?;
    let repo = SqliteNoteRepository::new(&conn);
    let record = NoteService::trash_note(&repo, &note_id)?;
    let note = record_to_loaded_note(record, &repo)?;
    sync_push(SyncCommand::PushNote(note_id));
    Ok(note)
}

#[uniffi::export]
pub fn restore_from_trash(note_id: String) -> Result<LoadedNote, AppError> {
    let s = state();
    let conn = db::database_connection(s)?;
    let repo = SqliteNoteRepository::new(&conn);
    let record = NoteService::restore_from_trash(&repo, &note_id)?;
    let note = record_to_loaded_note(record, &repo)?;
    sync_push(SyncCommand::PushNote(note_id));
    Ok(note)
}

#[uniffi::export]
pub fn delete_note_permanently(note_id: String) -> Result<(), AppError> {
    let s = state();
    let conn = db::database_connection(s)?;

    let orphaned =
        crate::domain::blob::service::find_orphaned_blob_hashes(&conn, &[note_id.clone()])?;

    let repo = SqliteNoteRepository::new(&conn);
    NoteService::delete_permanently(&repo, &note_id)?;

    let blossom_deletions =
        crate::domain::blob::service::cleanup_orphaned_blobs(s, &conn, &orphaned);
    spawn_blossom_deletions(blossom_deletions);

    s.html_cache.invalidate(&note_id);

    let _ = conn.execute(
        "INSERT OR IGNORE INTO pending_deletions (entity_id, created_at) VALUES (?1, ?2)",
        rusqlite::params![note_id, now_millis()],
    );
    sync_push(SyncCommand::PushDeletion(note_id));

    Ok(())
}

#[uniffi::export]
pub fn empty_trash() -> Result<(), AppError> {
    let s = state();
    let conn = db::database_connection(s)?;

    let repo = SqliteNoteRepository::new(&conn);
    let trashed_ids: Vec<String> = repo.trashed_note_ids()?;
    let orphaned =
        crate::domain::blob::service::find_orphaned_blob_hashes(&conn, &trashed_ids)?;

    let note_ids = NoteService::empty_trash(&repo)?;

    let blossom_deletions =
        crate::domain::blob::service::cleanup_orphaned_blobs(s, &conn, &orphaned);
    spawn_blossom_deletions(blossom_deletions);

    for note_id in &note_ids {
        s.html_cache.invalidate(note_id);
        let _ = conn.execute(
            "INSERT OR IGNORE INTO pending_deletions (entity_id, created_at) VALUES (?1, ?2)",
            rusqlite::params![note_id, now_millis()],
        );
        sync_push(SyncCommand::PushDeletion(note_id.clone()));
    }

    Ok(())
}

#[uniffi::export]
pub fn pin_note(note_id: String) -> Result<LoadedNote, AppError> {
    let s = state();
    let conn = db::database_connection(s)?;
    let repo = SqliteNoteRepository::new(&conn);
    let record = NoteService::pin_note(&repo, &note_id)?;
    let note = record_to_loaded_note(record, &repo)?;
    sync_push(SyncCommand::PushNote(note_id));
    Ok(note)
}

#[uniffi::export]
pub fn unpin_note(note_id: String) -> Result<LoadedNote, AppError> {
    let s = state();
    let conn = db::database_connection(s)?;
    let repo = SqliteNoteRepository::new(&conn);
    let record = NoteService::unpin_note(&repo, &note_id)?;
    let note = record_to_loaded_note(record, &repo)?;
    sync_push(SyncCommand::PushNote(note_id));
    Ok(note)
}

// ---------------------------------------------------------------------------
// Notebooks
// ---------------------------------------------------------------------------

#[uniffi::export]
pub fn create_notebook(input: CreateNotebookInput) -> Result<NotebookSummary, AppError> {
    let s = state();
    let conn = db::database_connection(s)?;
    let repo = SqliteNoteRepository::new(&conn);
    let notebook = NoteService::create_notebook(&repo, input)?;
    sync_push(SyncCommand::PushNotebook(notebook.id.clone()));
    Ok(notebook)
}

#[uniffi::export]
pub fn rename_notebook(input: RenameNotebookInput) -> Result<NotebookSummary, AppError> {
    let s = state();
    let conn = db::database_connection(s)?;
    let repo = SqliteNoteRepository::new(&conn);
    let notebook = NoteService::rename_notebook(&repo, input)?;
    sync_push(SyncCommand::PushNotebook(notebook.id.clone()));
    Ok(notebook)
}

#[uniffi::export]
pub fn delete_notebook(notebook_id: String) -> Result<(), AppError> {
    let s = state();
    let conn = db::database_connection(s)?;
    let repo = SqliteNoteRepository::new(&conn);
    NoteService::delete_notebook(&repo, &notebook_id)?;

    let _ = conn.execute(
        "INSERT OR IGNORE INTO pending_deletions (entity_id, created_at) VALUES (?1, ?2)",
        rusqlite::params![notebook_id, now_millis()],
    );
    sync_push(SyncCommand::PushDeletion(notebook_id));
    Ok(())
}

#[uniffi::export]
pub fn assign_note_notebook(input: AssignNoteNotebookInput) -> Result<LoadedNote, AppError> {
    let note_id = input.note_id.clone();
    let s = state();
    let conn = db::database_connection(s)?;
    let repo = SqliteNoteRepository::new(&conn);
    let record = NoteService::assign_notebook(&repo, input)?;
    let note = record_to_loaded_note(record, &repo)?;
    sync_push(SyncCommand::PushNote(note_id));
    Ok(note)
}

// ---------------------------------------------------------------------------
// Sync & Relays
// ---------------------------------------------------------------------------

#[uniffi::export]
pub fn list_relays() -> Result<Vec<Relay>, AppError> {
    let s = state();
    let conn = db::database_connection(s)?;
    crate::adapters::sqlite::relay_repository::list_relays(&conn)
}

#[uniffi::export]
pub fn set_sync_relay(url: String) -> Result<Vec<Relay>, AppError> {
    let s = state();
    let conn = db::database_connection(s)?;
    let relays = crate::adapters::sqlite::relay_repository::set_sync_relay(&conn, &url)?;
    reset_sync_state(&conn)?;

    let s2 = s.clone();
    tokio::spawn(async move {
        let _ = crate::adapters::nostr::sync_manager::start_if_ready(&s2).await;
    });

    Ok(relays)
}

#[uniffi::export]
pub fn remove_sync_relay() -> Result<Vec<Relay>, AppError> {
    let s = state();
    let conn = db::database_connection(s)?;
    let relays = crate::adapters::sqlite::relay_repository::remove_sync_relay(&conn)?;

    let manager = s.sync_manager.clone();
    tokio::spawn(async move {
        manager.stop().await;
    });

    Ok(relays)
}

#[uniffi::export]
pub fn add_publish_relay(url: String) -> Result<Vec<Relay>, AppError> {
    let s = state();
    let conn = db::database_connection(s)?;
    crate::adapters::sqlite::relay_repository::add_publish_relay(&conn, &url)
}

#[uniffi::export]
pub fn remove_relay(url: String, kind: String) -> Result<Vec<Relay>, AppError> {
    let s = state();
    let conn = db::database_connection(s)?;
    crate::adapters::sqlite::relay_repository::remove_relay(&conn, &url, &kind)
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn get_sync_status() -> Result<SyncState, AppError> {
    let s = state();
    Ok(s.sync_manager.state().await)
}

#[uniffi::export]
pub fn is_sync_enabled() -> Result<bool, AppError> {
    let s = state();
    let conn = db::database_connection(s)?;
    let val: Option<String> = conn
        .query_row(
            "SELECT value FROM app_settings WHERE key = 'sync_enabled'",
            [],
            |row| row.get(0),
        )
        .optional()?;
    Ok(val.as_deref() == Some("true"))
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn set_sync_enabled(enabled: bool) -> Result<(), AppError> {
    let s = state();
    let conn = db::database_connection(s)?;
    conn.execute(
        "INSERT OR REPLACE INTO app_settings (key, value) VALUES ('sync_enabled', ?1)",
        rusqlite::params![if enabled { "true" } else { "false" }],
    )?;
    drop(conn);

    if enabled {
        crate::adapters::nostr::sync_manager::start_if_ready(s).await?;
    } else {
        s.sync_manager.stop().await;
    }
    Ok(())
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn restart_sync() -> Result<(), AppError> {
    let s = state();
    crate::adapters::nostr::sync_manager::start_if_ready(s).await?;
    Ok(())
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn resync() -> Result<(), AppError> {
    let s = state();
    s.sync_manager.stop().await;

    let conn = db::database_connection(s)?;
    conn.execute_batch(
        "DELETE FROM notes_fts;
         DELETE FROM note_tags;
         DELETE FROM notes;
         DELETE FROM notebooks;
         DELETE FROM blob_meta;
         DELETE FROM pending_deletions;
         DELETE FROM app_settings WHERE key = 'sync_checkpoint';",
    )?;

    crate::adapters::nostr::sync_manager::start_if_ready(s).await?;
    Ok(())
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn unlock_current_account(nsec: String) -> Result<(), AppError> {
    let s = state();
    let conn = db::database_connection(s)?;

    // Parse and cache the keys
    let keys = nostr_sdk::prelude::Keys::parse(&nsec)
        .map_err(|e| AppError::custom(format!("Invalid key: {e}")))?;
    let public_key = keys.public_key().to_hex();
    s.unlocked_keys.insert(&public_key, &keys);
    drop(conn);

    crate::adapters::nostr::sync_manager::start_if_ready(s).await?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Blob
// ---------------------------------------------------------------------------

/// Status of a blob fetch operation.
#[derive(uniffi::Enum)]
pub enum BlobFetchStatus {
    Downloaded,
    Missing,
    NeedsUnlock,
}

#[uniffi::export]
pub fn get_blossom_url() -> Result<Option<String>, AppError> {
    let s = state();
    let conn = db::database_connection(s)?;
    Ok(crate::adapters::sqlite::sync_repository::get_blossom_url(&conn))
}

#[uniffi::export]
pub fn set_blossom_url(url: String) -> Result<(), AppError> {
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
    let s = state();
    let conn = db::database_connection(s)?;
    conn.execute(
        "INSERT OR REPLACE INTO app_settings (key, value) VALUES ('blossom_url', ?1)",
        rusqlite::params![url],
    )?;
    Ok(())
}

#[uniffi::export]
pub fn remove_blossom_url() -> Result<(), AppError> {
    let s = state();
    let conn = db::database_connection(s)?;
    conn.execute("DELETE FROM app_settings WHERE key = 'blossom_url'", [])?;
    Ok(())
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn fetch_blob(hash: String) -> Result<BlobFetchStatus, AppError> {
    let s = state();

    if crate::adapters::filesystem::attachments::has_local_blob(s, &hash)? {
        return Ok(BlobFetchStatus::Downloaded);
    }

    let conn = db::database_connection(s)?;
    let preferred_blossom_url =
        crate::adapters::sqlite::sync_repository::get_blossom_url(&conn);

    if !crate::adapters::mobile::key_store::is_current_identity_unlocked(s, &conn)? {
        return Ok(BlobFetchStatus::NeedsUnlock);
    }

    let (keys, pubkey_hex) =
        crate::adapters::mobile::key_store::keys_for_current_identity(s, &conn)?;

    let meta: Option<(String, String, String)> = if let Some(ref blossom_url) =
        preferred_blossom_url
    {
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
        None => return Ok(BlobFetchStatus::Missing),
    };

    drop(conn);

    let http_client = reqwest::Client::new();
    let ciphertext = crate::adapters::blossom::client::download_blob(
        &http_client,
        &server_url,
        &ciphertext_hash,
        &keys,
    )
    .await?;

    let plaintext = crate::adapters::blossom::client::decrypt_blob(&ciphertext, &key_hex)?;

    let conn2 = db::database_connection(s)?;
    let ext: String = conn2
        .query_row(
            "SELECT markdown FROM notes WHERE markdown LIKE ?1 LIMIT 1",
            rusqlite::params![format!("%attachment://{}%", hash)],
            |row| row.get::<_, String>(0),
        )
        .optional()?
        .and_then(|md| crate::domain::blob::service::extract_blob_extension(&md, &hash))
        .unwrap_or_else(|| "bin".to_string());

    crate::adapters::filesystem::attachments::save_blob(s, &hash, &ext, &plaintext)?;
    Ok(BlobFetchStatus::Downloaded)
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

#[uniffi::export]
pub fn list_accounts() -> Result<Vec<AccountSummary>, AppError> {
    let s = state();
    crate::domain::accounts::service::list_accounts(s)
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn add_account(nsec: String) -> Result<AccountSummary, AppError> {
    let s = state();
    s.sync_manager.stop().await;
    let result = crate::domain::accounts::service::add_account(s, &nsec);
    if result.is_ok() {
        s.html_cache.clear();
    }
    crate::adapters::nostr::sync_manager::auto_start(s.clone()).await;
    result
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn switch_account(public_key: String) -> Result<AccountSummary, AppError> {
    let s = state();
    s.sync_manager.stop().await;
    let result = crate::domain::accounts::service::switch_account(s, &public_key);
    if result.is_ok() {
        s.html_cache.clear();
    }
    crate::adapters::nostr::sync_manager::auto_start(s.clone()).await;
    result
}

// ---------------------------------------------------------------------------
// Sync info
// ---------------------------------------------------------------------------

/// Detailed sync information for the settings screen.
#[derive(uniffi::Record)]
pub struct SyncInfo {
    pub state: SyncState,
    pub relay_url: Option<String>,
    pub blossom_url: Option<String>,
    pub npub: Option<String>,
    pub synced_notes: i64,
    pub synced_notebooks: i64,
    pub pending_notes: i64,
    pub pending_notebooks: i64,
    pub total_notes: i64,
    pub checkpoint: i64,
    pub blobs_stored: i64,
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn get_sync_info() -> Result<SyncInfo, AppError> {
    let s = state();
    let sync_state = s.sync_manager.state().await;

    let conn = db::database_connection(s)?;

    let relay_url = crate::adapters::sqlite::sync_repository::get_sync_relay_url(&conn);
    let blossom_url = crate::adapters::sqlite::sync_repository::get_blossom_url(&conn);
    let npub: Option<String> = conn
        .query_row("SELECT npub FROM nostr_identity LIMIT 1", [], |row| {
            row.get(0)
        })
        .optional()?;

    let synced_notes: i64 = conn.query_row(
        "SELECT COUNT(*) FROM notes WHERE sync_event_id IS NOT NULL AND archived_at IS NULL",
        [],
        |row| row.get(0),
    )?;

    let total_notes: i64 = conn.query_row(
        "SELECT COUNT(*) FROM notes WHERE archived_at IS NULL",
        [],
        |row| row.get(0),
    )?;

    let synced_notebooks: i64 = conn.query_row(
        "SELECT COUNT(*) FROM notebooks WHERE sync_event_id IS NOT NULL",
        [],
        |row| row.get(0),
    )?;

    let pending_notes: i64 = conn.query_row(
        "SELECT COUNT(*) FROM notes WHERE locally_modified = 1",
        [],
        |row| row.get(0),
    )?;

    let pending_notebooks: i64 = conn.query_row(
        "SELECT COUNT(*) FROM notebooks WHERE locally_modified = 1",
        [],
        |row| row.get(0),
    )?;

    let checkpoint: i64 =
        crate::adapters::sqlite::sync_repository::get_checkpoint(&conn);

    let blobs_stored: i64 =
        conn.query_row("SELECT COUNT(*) FROM blob_meta", [], |row| row.get(0))?;

    Ok(SyncInfo {
        state: sync_state,
        relay_url,
        blossom_url,
        npub,
        synced_notes,
        synced_notebooks,
        pending_notes,
        pending_notebooks,
        total_notes,
        checkpoint,
        blobs_stored,
    })
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

use rusqlite::OptionalExtension;

fn reset_sync_state(conn: &rusqlite::Connection) -> Result<(), AppError> {
    conn.execute_batch("BEGIN")?;
    let result = (|| -> Result<(), AppError> {
        conn.execute(
            "UPDATE notes SET sync_event_id = NULL, locally_modified = 1",
            [],
        )?;
        conn.execute(
            "UPDATE notebooks SET sync_event_id = NULL, locally_modified = 1",
            [],
        )?;
        conn.execute("DELETE FROM app_settings WHERE key = 'sync_checkpoint'", [])?;
        conn.execute("DELETE FROM app_settings WHERE key = 'sync_relay_url'", [])?;
        conn.execute("DELETE FROM pending_deletions", [])?;
        Ok(())
    })();
    if result.is_ok() {
        conn.execute_batch("COMMIT")?;
    } else {
        let _ = conn.execute_batch("ROLLBACK");
    }
    result
}

use crate::adapters::sqlite::note_repository::SqliteNoteRepository;
use crate::db::database_connection;
use crate::domain::common::time::now_millis;
use crate::domain::notes::model::*;
use crate::domain::notes::service::NoteService;
use crate::error::AppError;
use crate::infra::cache::RenderedHtmlCache;
use crate::ports::note_repository::{NoteRecord, NoteRepository};
use crate::adapters::nostr::sync_manager::SyncCommand;
use tauri::{AppHandle, Manager};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn sync_push(app: &AppHandle, cmd: SyncCommand) {
    let manager = app.state::<crate::adapters::nostr::sync_manager::SyncManager>().inner().clone();
    tauri::async_runtime::spawn(async move {
        manager.push(cmd).await;
    });
}

fn render_html(app: &AppHandle, note_id: &str, modified_at: i64, markdown: &str) -> String {
    let cache = app.state::<RenderedHtmlCache>();
    if let Some(html) = cache.get(note_id, modified_at) {
        return html;
    }
    let html = crate::adapters::markdown::renderer::markdown_to_lexical_html(markdown);
    cache.insert(note_id.to_string(), modified_at, html.clone());
    html
}

fn record_to_loaded_note(app: &AppHandle, record: NoteRecord, repo: &SqliteNoteRepository) -> Result<LoadedNote, AppError> {
    let tags = repo.tags_for_note(&record.id)?;
    let html = render_html(app, &record.id, record.modified_at, &record.markdown);
    Ok(LoadedNote {
        id: record.id,
        title: record.title,
        notebook: record.notebook_id.zip(record.notebook_name).map(|(id, name)| NotebookRef { id, name }),
        modified_at: record.modified_at,
        markdown: record.markdown,
        html,
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

/// Spawn async Blossom blob deletions for orphaned blobs.
/// `blossom_deletions` is a list of (`server_url`, `ciphertext_hash`) pairs.
fn spawn_blossom_deletions(app: &AppHandle, blossom_deletions: Vec<(String, String)>) {
    if blossom_deletions.is_empty() {
        return;
    }

    let conn = match database_connection(app) {
        Ok(c) => c,
        Err(_) => return,
    };
    let (keys, _) = match crate::adapters::tauri::key_store::keys_for_current_identity(app, &conn) {
        Ok(identity) => identity,
        Err(_) => return,
    };
    drop(conn);

    tauri::async_runtime::spawn(async move {
        let client = reqwest::Client::new();
        for (server_url, ciphertext_hash) in blossom_deletions {
            if let Err(e) =
                crate::adapters::blossom::client::delete_blob(&client, &server_url, &ciphertext_hash, &keys).await
            {
                eprintln!("[blob-gc] failed to delete from Blossom: {e}");
            }
        }
    });
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn bootstrap(app: AppHandle) -> Result<BootstrapPayload, AppError> {
    let conn = database_connection(&app)?;
    let repo = SqliteNoteRepository::new(&conn);
    Ok(NoteService::bootstrap(&repo)?)
}

#[tauri::command]
pub fn todo_count(app: AppHandle) -> Result<i64, AppError> {
    let conn = database_connection(&app)?;
    let repo = SqliteNoteRepository::new(&conn);
    Ok(NoteService::todo_count(&repo)?)
}

#[tauri::command]
pub fn query_notes(app: AppHandle, input: NoteQueryInput) -> Result<NotePagePayload, AppError> {
    let conn = database_connection(&app)?;
    let repo = SqliteNoteRepository::new(&conn);
    Ok(NoteService::query_notes(&repo, input)?)
}

#[tauri::command]
pub fn contextual_tags(
    app: AppHandle,
    input: ContextualTagsInput,
) -> Result<ContextualTagsPayload, AppError> {
    let conn = database_connection(&app)?;
    let repo = SqliteNoteRepository::new(&conn);
    Ok(NoteService::contextual_tags(&repo, input)?)
}

#[tauri::command]
pub fn load_note(app: AppHandle, note_id: String) -> Result<LoadedNote, AppError> {
    let conn = database_connection(&app)?;
    let repo = SqliteNoteRepository::new(&conn);
    let record = NoteService::load_note(&repo, &note_id)?;
    record_to_loaded_note(&app, record, &repo)
}

#[tauri::command]
pub fn create_note(
    app: AppHandle,
    notebook_id: Option<String>,
    tags: Vec<String>,
    markdown: Option<String>,
) -> Result<LoadedNote, AppError> {
    let conn = database_connection(&app)?;
    let repo = SqliteNoteRepository::new(&conn);
    let record = NoteService::create_note(&repo, notebook_id.as_deref(), &tags, markdown.as_deref())?;
    record_to_loaded_note(&app, record, &repo)
}

#[tauri::command]
pub fn duplicate_note(app: AppHandle, note_id: String) -> Result<LoadedNote, AppError> {
    let conn = database_connection(&app)?;
    let repo = SqliteNoteRepository::new(&conn);
    let record = NoteService::duplicate_note(&repo, &note_id)?;
    let note = record_to_loaded_note(&app, record, &repo)?;
    sync_push(&app, SyncCommand::PushNote(note.id.clone()));
    Ok(note)
}

#[tauri::command]
pub fn save_note(app: AppHandle, input: SaveNoteInput) -> Result<LoadedNote, AppError> {
    let note_id = input.id.clone();
    let conn = database_connection(&app)?;
    let repo = SqliteNoteRepository::new(&conn);
    let (record, content_changed) = NoteService::save_note(&repo, input)?;
    let note = record_to_loaded_note(&app, record, &repo)?;
    if content_changed {
        sync_push(&app, SyncCommand::PushNote(note_id));
    }
    Ok(note)
}

#[tauri::command]
pub fn set_note_readonly(app: AppHandle, input: SetNoteReadonlyInput) -> Result<LoadedNote, AppError> {
    let note_id = input.note_id.clone();
    let conn = database_connection(&app)?;
    let repo = SqliteNoteRepository::new(&conn);
    let record = NoteService::set_readonly(&repo, input)?;
    let note = record_to_loaded_note(&app, record, &repo)?;
    sync_push(&app, SyncCommand::PushNote(note_id));
    Ok(note)
}

#[tauri::command]
pub fn archive_note(app: AppHandle, note_id: String) -> Result<LoadedNote, AppError> {
    let conn = database_connection(&app)?;
    let repo = SqliteNoteRepository::new(&conn);
    let record = NoteService::archive_note(&repo, &note_id)?;
    let note = record_to_loaded_note(&app, record, &repo)?;
    sync_push(&app, SyncCommand::PushNote(note_id));
    Ok(note)
}

#[tauri::command]
pub fn restore_note(app: AppHandle, note_id: String) -> Result<LoadedNote, AppError> {
    let conn = database_connection(&app)?;
    let repo = SqliteNoteRepository::new(&conn);
    let record = NoteService::restore_note(&repo, &note_id)?;
    let note = record_to_loaded_note(&app, record, &repo)?;
    sync_push(&app, SyncCommand::PushNote(note_id));
    Ok(note)
}

#[tauri::command]
pub fn trash_note(app: AppHandle, note_id: String) -> Result<LoadedNote, AppError> {
    let conn = database_connection(&app)?;
    let repo = SqliteNoteRepository::new(&conn);
    let record = NoteService::trash_note(&repo, &note_id)?;
    let note = record_to_loaded_note(&app, record, &repo)?;
    sync_push(&app, SyncCommand::PushNote(note_id));
    Ok(note)
}

#[tauri::command]
pub fn restore_from_trash(app: AppHandle, note_id: String) -> Result<LoadedNote, AppError> {
    let conn = database_connection(&app)?;
    let repo = SqliteNoteRepository::new(&conn);
    let record = NoteService::restore_from_trash(&repo, &note_id)?;
    let note = record_to_loaded_note(&app, record, &repo)?;
    sync_push(&app, SyncCommand::PushNote(note_id));
    Ok(note)
}

#[tauri::command]
pub fn delete_note_permanently(app: AppHandle, note_id: String) -> Result<(), AppError> {
    let conn = database_connection(&app)?;

    // Find orphaned blobs before deleting the note.
    let orphaned = crate::adapters::filesystem::attachments::find_orphaned_blob_hashes(&conn, &[note_id.clone()])?;

    let repo = SqliteNoteRepository::new(&conn);
    NoteService::delete_permanently(&repo, &note_id)?;

    // Blob cleanup (needs AppHandle).
    let blossom_deletions = crate::adapters::filesystem::attachments::cleanup_orphaned_blobs(&app, &conn, &orphaned);
    spawn_blossom_deletions(&app, blossom_deletions);

    // Invalidate cached HTML.
    let cache = app.state::<RenderedHtmlCache>();
    cache.invalidate(&note_id);

    // Record pending deletion for sync.
    let _ = conn.execute(
        "INSERT OR IGNORE INTO pending_deletions (entity_id, created_at) VALUES (?1, ?2)",
        rusqlite::params![note_id, now_millis()],
    );
    sync_push(&app, SyncCommand::PushDeletion(note_id));

    Ok(())
}

#[tauri::command]
pub fn empty_trash(app: AppHandle) -> Result<(), AppError> {
    let conn = database_connection(&app)?;

    // Collect trashed note IDs and find orphaned blobs before deleting.
    let repo = SqliteNoteRepository::new(&conn);
    let trashed_ids: Vec<String> = repo.trashed_note_ids()?;
    let orphaned = crate::adapters::filesystem::attachments::find_orphaned_blob_hashes(&conn, &trashed_ids)?;

    let note_ids = NoteService::empty_trash(&repo)?;

    // Blob cleanup.
    let blossom_deletions = crate::adapters::filesystem::attachments::cleanup_orphaned_blobs(&app, &conn, &orphaned);
    spawn_blossom_deletions(&app, blossom_deletions);

    // Invalidate cached HTML and record pending deletions.
    let cache = app.state::<RenderedHtmlCache>();
    for note_id in &note_ids {
        cache.invalidate(note_id);
        let _ = conn.execute(
            "INSERT OR IGNORE INTO pending_deletions (entity_id, created_at) VALUES (?1, ?2)",
            rusqlite::params![note_id, now_millis()],
        );
        sync_push(&app, SyncCommand::PushDeletion(note_id.clone()));
    }

    Ok(())
}

#[tauri::command]
pub fn create_notebook(
    app: AppHandle,
    input: CreateNotebookInput,
) -> Result<NotebookSummary, AppError> {
    let conn = database_connection(&app)?;
    let repo = SqliteNoteRepository::new(&conn);
    let notebook = NoteService::create_notebook(&repo, input)?;
    sync_push(&app, SyncCommand::PushNotebook(notebook.id.clone()));
    Ok(notebook)
}

#[tauri::command]
pub fn rename_notebook(
    app: AppHandle,
    input: RenameNotebookInput,
) -> Result<NotebookSummary, AppError> {
    let conn = database_connection(&app)?;
    let repo = SqliteNoteRepository::new(&conn);
    let notebook = NoteService::rename_notebook(&repo, input)?;
    sync_push(&app, SyncCommand::PushNotebook(notebook.id.clone()));
    Ok(notebook)
}

#[tauri::command]
pub fn delete_notebook(app: AppHandle, notebook_id: String) -> Result<(), AppError> {
    let conn = database_connection(&app)?;
    let repo = SqliteNoteRepository::new(&conn);
    NoteService::delete_notebook(&repo, &notebook_id)?;

    let _ = conn.execute(
        "INSERT OR IGNORE INTO pending_deletions (entity_id, created_at) VALUES (?1, ?2)",
        rusqlite::params![notebook_id, now_millis()],
    );
    sync_push(&app, SyncCommand::PushDeletion(notebook_id));
    Ok(())
}

#[tauri::command]
pub fn assign_note_notebook(
    app: AppHandle,
    input: AssignNoteNotebookInput,
) -> Result<LoadedNote, AppError> {
    let note_id = input.note_id.clone();
    let conn = database_connection(&app)?;
    let repo = SqliteNoteRepository::new(&conn);
    let record = NoteService::assign_notebook(&repo, input)?;
    let note = record_to_loaded_note(&app, record, &repo)?;
    sync_push(&app, SyncCommand::PushNote(note_id));
    Ok(note)
}

#[tauri::command]
pub fn pin_note(app: AppHandle, note_id: String) -> Result<LoadedNote, AppError> {
    let conn = database_connection(&app)?;
    let repo = SqliteNoteRepository::new(&conn);
    let record = NoteService::pin_note(&repo, &note_id)?;
    let note = record_to_loaded_note(&app, record, &repo)?;
    sync_push(&app, SyncCommand::PushNote(note_id));
    Ok(note)
}

#[tauri::command]
pub fn unpin_note(app: AppHandle, note_id: String) -> Result<LoadedNote, AppError> {
    let conn = database_connection(&app)?;
    let repo = SqliteNoteRepository::new(&conn);
    let record = NoteService::unpin_note(&repo, &note_id)?;
    let note = record_to_loaded_note(&app, record, &repo)?;
    sync_push(&app, SyncCommand::PushNote(note_id));
    Ok(note)
}

#[tauri::command]
pub fn search_notes(app: AppHandle, query: String) -> Result<Vec<SearchResult>, AppError> {
    let conn = database_connection(&app)?;
    let repo = SqliteNoteRepository::new(&conn);
    Ok(NoteService::search_notes(&repo, &query)?)
}

#[tauri::command]
pub fn search_tags(app: AppHandle, query: String) -> Result<Vec<String>, AppError> {
    let conn = database_connection(&app)?;
    let repo = SqliteNoteRepository::new(&conn);
    Ok(NoteService::search_tags(&repo, &query)?)
}

#[tauri::command]
pub fn export_notes(app: AppHandle, input: ExportNotesInput) -> Result<usize, AppError> {
    let conn = database_connection(&app)?;
    let repo = SqliteNoteRepository::new(&conn);
    Ok(NoteService::export_notes(&repo, input)?)
}

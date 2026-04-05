use crate::adapters::nostr::relay_client::{
    fetch_relay_info, RevisionRelayConnection, RevisionRelayIncomingMessage,
};
use crate::adapters::sqlite::revision_sync_repository::{
    list_sync_heads_for_author, upsert_sync_relay_state,
};
use crate::db::{active_account, database_connection};
use crate::domain::sync::model::SyncChangePayload;
use crate::domain::sync::revision_apply_service::apply_remote_revision_event;
use crate::domain::sync::revision_negentropy::{RevisionNegentropyItem, RevisionNegentropySession};
use crate::error::AppError;
use nostr_sdk::prelude::{Event, Keys};
use rusqlite::Connection;
use std::collections::BTreeSet;
use std::path::Path;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tokio::time::timeout;
use url::Url;

const BOOTSTRAP_MESSAGE_TIMEOUT: Duration = Duration::from_secs(15);

pub struct RevisionBootstrapResult {
    pub connection: RevisionRelayConnection,
    // `NEG-STATUS.snapshot_seq`: the relay sequence boundary that separates the
    // negotiated head snapshot from the live `CHANGES` tail that follows it.
    pub snapshot_seq: i64,
    #[cfg_attr(not(test), allow(dead_code))]
    pub have: Vec<String>,
    #[cfg_attr(not(test), allow(dead_code))]
    pub need: Vec<String>,
    pub author_pubkey: String,
}

pub async fn bootstrap_relay_connection(
    app: &AppHandle,
    relay_ws_url: &str,
) -> Result<RevisionBootstrapResult, AppError> {
    let conn = database_connection(app)?;
    let (keys, _) = crate::adapters::tauri::key_store::keys_for_current_identity(app, &conn)?;
    let db_path = active_account(app)?.db_path;
    drop(conn);

    bootstrap_with_keys_and_changes(
        &db_path,
        &keys,
        relay_ws_url,
        |_| {},
        |change| {
            let _ = app.emit("sync-remote-change", change);
        },
    )
    .await
}

#[cfg(test)]
pub async fn bootstrap_with_keys(
    db_path: &Path,
    keys: &Keys,
    relay_ws_url: &str,
    mut invalidate_cache: impl FnMut(&str),
) -> Result<RevisionBootstrapResult, AppError> {
    bootstrap_with_keys_and_changes(db_path, keys, relay_ws_url, &mut invalidate_cache, |_| {})
        .await
}

async fn bootstrap_with_keys_and_changes(
    db_path: &Path,
    keys: &Keys,
    relay_ws_url: &str,
    mut invalidate_cache: impl FnMut(&str),
    mut on_change: impl FnMut(SyncChangePayload),
) -> Result<RevisionBootstrapResult, AppError> {
    let relay_http_url = relay_http_url_from_ws(relay_ws_url)?;
    let relay_info = fetch_relay_info(&relay_http_url).await?;

    let author_pubkey = keys.public_key().to_hex();
    let conn = open_sync_db(db_path)?;
    let heads = list_sync_heads_for_author(&conn, &author_pubkey)?;
    let local_items = heads
        .into_iter()
        .map(|head| RevisionNegentropyItem {
            revision_id: head.rev,
            mtime: head.mtime as u64,
        })
        .collect::<Vec<_>>();

    upsert_sync_relay_state(
        &conn,
        relay_ws_url,
        None,
        None,
        None,
        relay_info.revision_sync.retention.min_payload_mtime,
    )?;

    let mut connection = RevisionRelayConnection::connect_authenticated(relay_ws_url, keys).await?;
    connection
        .send_neg_open("bootstrap", &author_pubkey)
        .await?;

    let snapshot_seq =
        match recv_bootstrap_message(&mut connection, relay_ws_url, "NEG-STATUS").await? {
            RevisionRelayIncomingMessage::NegStatus {
                subscription_id,
                strategy,
                snapshot_seq,
            } => {
                if subscription_id != "bootstrap" {
                    return Err(AppError::custom(format!(
                        "Unexpected NEG-STATUS subscription id: {subscription_id}"
                    )));
                }
                if strategy != relay_info.revision_sync.strategy {
                    return Err(AppError::custom(format!(
                        "Revision relay strategy mismatch: expected {}, got {strategy}",
                        relay_info.revision_sync.strategy
                    )));
                }
                snapshot_seq
            }
            RevisionRelayIncomingMessage::NegErr { message, .. } => {
                return Err(AppError::custom(format!(
                    "Revision relay NEG-OPEN failed: {message}"
                )))
            }
            other => {
                return Err(AppError::custom(format!(
                    "Unexpected relay response to NEG-OPEN: {other:?}"
                )))
            }
        };

    let mut negentropy = RevisionNegentropySession::new(&local_items, 0)?;
    let mut message = Some(negentropy.initiate_hex()?);
    let mut have = BTreeSet::new();
    let mut need = BTreeSet::new();

    while let Some(outgoing_payload) = message {
        connection
            .send_neg_msg("bootstrap", &outgoing_payload)
            .await?;
        let response = recv_bootstrap_message(&mut connection, relay_ws_url, "NEG-MSG").await?;
        match response {
            RevisionRelayIncomingMessage::NegMsg {
                subscription_id,
                payload: incoming_payload,
            } => {
                if subscription_id != "bootstrap" {
                    return Err(AppError::custom(format!(
                        "Unexpected NEG-MSG subscription id: {subscription_id}"
                    )));
                }
                let result = negentropy.reconcile_with_ids_hex(&incoming_payload)?;
                have.extend(result.have);
                need.extend(result.need);
                message = result.next_message_hex;
            }
            RevisionRelayIncomingMessage::NegErr { message, .. } => {
                return Err(AppError::custom(format!(
                    "Revision relay NEG-MSG failed: {message}"
                )))
            }
            other => {
                return Err(AppError::custom(format!(
                    "Unexpected relay response during NEG-MSG: {other:?}"
                )))
            }
        }
    }

    connection.send_neg_close("bootstrap").await?;
    match recv_bootstrap_message(&mut connection, relay_ws_url, "NEG-CLOSE").await? {
        RevisionRelayIncomingMessage::Closed {
            subscription_id, ..
        } if subscription_id == "bootstrap" => {}
        other => {
            return Err(AppError::custom(format!(
                "Unexpected relay response to NEG-CLOSE: {other:?}"
            )))
        }
    }

    let need = need.into_iter().collect::<Vec<_>>();
    if !need.is_empty() {
        if relay_info.revision_sync.batch_fetch {
            connection
                .send_req_revisions_batch("bootstrap-fetch", &author_pubkey, &need)
                .await?;
        } else {
            connection
                .send_req_revisions("bootstrap-fetch", &author_pubkey, &need)
                .await?;
        }

        let mut fetched_events = Vec::<Event>::new();
        let mut compacted_revisions = Vec::new();

        loop {
            match connection.recv_message().await? {
                RevisionRelayIncomingMessage::Event {
                    subscription_id,
                    event,
                } => {
                    if subscription_id != "bootstrap-fetch" {
                        return Err(AppError::custom(format!(
                            "Unexpected revision fetch subscription id: {subscription_id}"
                        )));
                    }
                    fetched_events.push(event);
                }
                RevisionRelayIncomingMessage::EventsBatch {
                    subscription_id,
                    events,
                } => {
                    if subscription_id != "bootstrap-fetch" {
                        return Err(AppError::custom(format!(
                            "Unexpected batched revision fetch subscription id: {subscription_id}"
                        )));
                    }

                    fetched_events.extend(events);
                }
                RevisionRelayIncomingMessage::EventStatus {
                    subscription_id,
                    rev,
                    status,
                } => {
                    if subscription_id != "bootstrap-fetch" {
                        return Err(AppError::custom(format!(
                            "Unexpected revision fetch status subscription id: {subscription_id}"
                        )));
                    }
                    if status == "payload_compacted" {
                        compacted_revisions.push(rev);
                    } else {
                        return Err(AppError::custom(format!(
                            "Unexpected revision fetch status: {status}"
                        )));
                    }
                }
                RevisionRelayIncomingMessage::Eose { subscription_id } => {
                    if subscription_id == "bootstrap-fetch" {
                        break;
                    }
                    return Err(AppError::custom(format!(
                        "Unexpected EOSE subscription id: {subscription_id}"
                    )));
                }
                other => {
                    return Err(AppError::custom(format!(
                        "Unexpected relay response during bootstrap fetch: {other:?}"
                    )))
                }
            }
        }

        if !compacted_revisions.is_empty() {
            let retention_hint = relay_info
                .revision_sync
                .retention
                .min_payload_mtime
                .map(|mtime| format!(" relay min_payload_mtime={mtime}."))
                .unwrap_or_default();
            return Err(AppError::custom(format!(
                "Revision relay no longer retains payloads for revisions: {}.{}",
                compacted_revisions.join(", "),
                retention_hint
            )));
        }

        if !fetched_events.is_empty() {
            let mut conn = open_sync_db(db_path)?;
            let tx = conn.transaction()?;
            let mut invalidated_notes = BTreeSet::new();
            let mut applied_changes = Vec::new();

            for event in &fetched_events {
                if let Some(change) =
                    apply_remote_revision_event(&tx, relay_ws_url, keys, event, None, |note_id| {
                        invalidated_notes.insert(note_id.to_string());
                    })?
                {
                    applied_changes.push(change);
                }
            }

            tx.commit()?;

            for note_id in invalidated_notes {
                invalidate_cache(&note_id);
            }
            for change in applied_changes {
                on_change(change);
            }
        }
    }

    let conn = open_sync_db(db_path)?;
    // Record the Negentropy handoff boundary so the live `CHANGES` subscription
    // can resume from the exact snapshot we just reconciled against.
    upsert_sync_relay_state(
        &conn,
        relay_ws_url,
        None,
        Some(snapshot_seq),
        Some(crate::domain::common::time::now_millis()),
        relay_info.revision_sync.retention.min_payload_mtime,
    )?;

    Ok(RevisionBootstrapResult {
        connection,
        snapshot_seq,
        have: have.into_iter().collect(),
        need,
        author_pubkey,
    })
}

async fn recv_bootstrap_message(
    connection: &mut RevisionRelayConnection,
    relay_ws_url: &str,
    step: &str,
) -> Result<RevisionRelayIncomingMessage, AppError> {
    match timeout(BOOTSTRAP_MESSAGE_TIMEOUT, connection.recv_message()).await {
        Ok(result) => result,
        Err(_) => Err(AppError::custom(format!(
            "Timed out waiting for revision relay during bootstrap ({step}) on {relay_ws_url}"
        ))),
    }
}

pub fn relay_http_url_from_ws(relay_ws_url: &str) -> Result<String, AppError> {
    let mut url = Url::parse(relay_ws_url)
        .map_err(|e| AppError::custom(format!("Invalid relay URL: {e}")))?;

    match url.scheme() {
        "ws" => url
            .set_scheme("http")
            .map_err(|_| AppError::custom("Failed to convert ws scheme to http"))?,
        "wss" => url
            .set_scheme("https")
            .map_err(|_| AppError::custom("Failed to convert wss scheme to https"))?,
        "http" | "https" => {}
        other => {
            return Err(AppError::custom(format!(
                "Unsupported relay URL scheme: {other}"
            )))
        }
    }

    if url.path() == "/ws" {
        url.set_path("/");
    }

    Ok(url.to_string())
}

fn open_sync_db(db_path: &Path) -> Result<Connection, AppError> {
    let conn = Connection::open(db_path)?;
    conn.execute_batch("PRAGMA foreign_keys = ON;")?;
    Ok(conn)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::adapters::nostr::comet_note_revision::{
        build_note_revision_event, compute_note_revision_id, parse_note_revision_event,
        NoteRevisionEventMeta, NoteRevisionPayload, COMET_NOTE_COLLECTION,
    };
    use crate::adapters::sqlite::migrations::account_migrations;
    use crate::adapters::sqlite::revision_sync_repository::get_sync_relay_state;
    use crate::domain::sync::revision_service::{
        build_pending_note_deletion_revision, build_pending_note_revision,
        persist_local_deletion_revision, persist_local_note_revision,
    };
    use nostr_sdk::prelude::Event;
    use nostr_sdk::prelude::Keys;
    use postgres::{Client as PgClient, NoTls};
    use reqwest::Client;
    use rusqlite::Connection;
    use std::path::PathBuf;
    use std::process::{Child, Command, Stdio};
    use std::sync::Once;
    use std::thread;
    use std::time::Duration;
    use url::Url;

    const TEST_ADMIN_TOKEN: &str = "test-admin-token";
    static EXTERNAL_TEST_PREREQ_WARNING: Once = Once::new();

    #[test]
    fn converts_ws_root_to_http_root() {
        assert_eq!(
            relay_http_url_from_ws("ws://localhost:3400/ws").unwrap(),
            "http://localhost:3400/"
        );
        assert_eq!(
            relay_http_url_from_ws("wss://relay.example/ws").unwrap(),
            "https://relay.example/"
        );
    }

    #[tokio::test]
    async fn bootstraps_from_a_real_relay() {
        if !external_relay_test_prereqs_available() {
            return;
        }

        let keys = Keys::generate();
        let relay = TestRevisionRelay::start(39420).await;
        let event =
            make_remote_note_event(&keys, "note-1", "Remote Title", "# Remote Title\n\nBody");
        relay.publish_event(&event).await;

        let temp_dir = std::env::temp_dir();
        let db_path = temp_dir.join(format!(
            "comet-revision-bootstrap-test-{}.db",
            std::process::id()
        ));
        let _ = std::fs::remove_file(&db_path);
        let mut conn = Connection::open(&db_path).unwrap();
        account_migrations().to_latest(&mut conn).unwrap();

        let result = bootstrap_with_keys(&db_path, &keys, &relay.ws_url, |_| {})
            .await
            .unwrap();

        assert_eq!(result.snapshot_seq, 1);
        assert_eq!(result.need.len(), 1);

        let current_rev: Option<String> = conn
            .query_row(
                "SELECT current_rev FROM notes WHERE id = 'note-1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert!(current_rev.is_some());

        let _ = std::fs::remove_file(db_path);
        relay.stop();
    }

    #[tokio::test]
    async fn pushes_local_revision_and_bootstraps_it_into_second_db() {
        if !external_relay_test_prereqs_available() {
            return;
        }

        let keys = Keys::generate();
        let relay = TestRevisionRelay::start(39421).await;

        let temp_dir = std::env::temp_dir();
        let source_db_path = temp_dir.join(format!(
            "comet-revision-push-source-test-{}.db",
            std::process::id()
        ));
        let destination_db_path = temp_dir.join(format!(
            "comet-revision-push-destination-test-{}.db",
            std::process::id()
        ));
        let _ = std::fs::remove_file(&source_db_path);
        let _ = std::fs::remove_file(&destination_db_path);

        let mut source_conn = Connection::open(&source_db_path).unwrap();
        account_migrations().to_latest(&mut source_conn).unwrap();
        seed_note(
            &source_conn,
            "note-1",
            "Local Title",
            "# Local Title\n\nLocal Body",
        );

        let pushed_revision_id =
            push_local_note_revision(&source_db_path, &keys, &relay.ws_url, "note-1").await;

        let mut destination_conn = Connection::open(&destination_db_path).unwrap();
        account_migrations()
            .to_latest(&mut destination_conn)
            .unwrap();

        let result = bootstrap_with_keys(&destination_db_path, &keys, &relay.ws_url, |_| {})
            .await
            .unwrap();

        assert_eq!(result.snapshot_seq, 1);
        assert_eq!(result.need, vec![pushed_revision_id.clone()]);

        let (title, markdown, current_rev): (String, String, Option<String>) = destination_conn
            .query_row(
                "SELECT title, markdown, current_rev FROM notes WHERE id = 'note-1'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap();

        assert_eq!(title, "Local Title");
        assert_eq!(markdown, "# Local Title\n\nLocal Body");
        assert_eq!(current_rev, Some(pushed_revision_id));

        let _ = std::fs::remove_file(source_db_path);
        let _ = std::fs::remove_file(destination_db_path);
        relay.stop();
    }

    #[tokio::test]
    async fn bootstraps_revision_blob_metadata_without_rewriting_attachment_urls() {
        if !external_relay_test_prereqs_available() {
            return;
        }

        let keys = Keys::generate();
        let relay = TestRevisionRelay::start(39441).await;
        let hash = "a".repeat(64);
        let ciphertext_hash = "b".repeat(64);
        let key_hex = "c".repeat(64);
        let markdown = format!("# Blob Title\n\n![img](attachment://{hash}.png)");

        let temp_dir = std::env::temp_dir();
        let source_db_path = temp_dir.join(format!(
            "comet-revision-blob-source-test-{}.db",
            std::process::id()
        ));
        let destination_db_path = temp_dir.join(format!(
            "comet-revision-blob-destination-test-{}.db",
            std::process::id()
        ));
        let _ = std::fs::remove_file(&source_db_path);
        let _ = std::fs::remove_file(&destination_db_path);

        let mut source_conn = Connection::open(&source_db_path).unwrap();
        account_migrations().to_latest(&mut source_conn).unwrap();
        seed_note(&source_conn, "note-blob", "Blob Title", &markdown);
        source_conn
            .execute(
                "INSERT INTO app_settings (key, value) VALUES ('blossom_url', 'https://blobs.example.com')",
                [],
            )
            .unwrap();
        source_conn
            .execute(
                "INSERT INTO blob_meta (plaintext_hash, server_url, pubkey, ciphertext_hash, encryption_key)
                 VALUES (?1, 'https://blobs.example.com', ?2, ?3, ?4)",
                rusqlite::params![hash, keys.public_key().to_hex(), ciphertext_hash, key_hex],
            )
            .unwrap();

        let pushed_revision_id =
            push_local_note_revision(&source_db_path, &keys, &relay.ws_url, "note-blob").await;

        let mut destination_conn = Connection::open(&destination_db_path).unwrap();
        account_migrations()
            .to_latest(&mut destination_conn)
            .unwrap();
        destination_conn
            .execute(
                "INSERT INTO app_settings (key, value) VALUES ('blossom_url', 'https://blobs.example.com')",
                [],
            )
            .unwrap();

        let result = bootstrap_with_keys(&destination_db_path, &keys, &relay.ws_url, |_| {})
            .await
            .unwrap();

        assert_eq!(result.snapshot_seq, 1);
        assert_eq!(result.need, vec![pushed_revision_id.clone()]);

        let (stored_markdown, current_rev): (String, Option<String>) = destination_conn
            .query_row(
                "SELECT markdown, current_rev FROM notes WHERE id = 'note-blob'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(stored_markdown, markdown);
        assert_eq!(current_rev, Some(pushed_revision_id));

        let stored_blob_meta: (String, String, String) = destination_conn
            .query_row(
                "SELECT server_url, ciphertext_hash, encryption_key
                 FROM blob_meta
                 WHERE plaintext_hash = ?1 AND pubkey = ?2",
                rusqlite::params![hash, keys.public_key().to_hex()],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap();
        assert_eq!(
            stored_blob_meta,
            (
                "https://blobs.example.com".to_string(),
                ciphertext_hash,
                key_hex,
            )
        );

        let _ = std::fs::remove_file(source_db_path);
        let _ = std::fs::remove_file(destination_db_path);
        relay.stop();
    }

    #[tokio::test]
    async fn pushes_local_revision_and_bootstraps_it_into_second_db_via_root_websocket_url() {
        if !external_relay_test_prereqs_available() {
            return;
        }

        let keys = Keys::generate();
        let relay = TestRevisionRelay::start(39435).await;

        let temp_dir = std::env::temp_dir();
        let source_db_path = temp_dir.join(format!(
            "comet-revision-push-root-source-test-{}.db",
            std::process::id()
        ));
        let destination_db_path = temp_dir.join(format!(
            "comet-revision-push-root-destination-test-{}.db",
            std::process::id()
        ));
        let _ = std::fs::remove_file(&source_db_path);
        let _ = std::fs::remove_file(&destination_db_path);

        let mut source_conn = Connection::open(&source_db_path).unwrap();
        account_migrations().to_latest(&mut source_conn).unwrap();
        seed_note(
            &source_conn,
            "note-1",
            "Root Path Title",
            "# Root Path Title\n\nLocal Body",
        );

        let pushed_revision_id =
            push_local_note_revision(&source_db_path, &keys, &relay.root_ws_url, "note-1").await;

        let mut destination_conn = Connection::open(&destination_db_path).unwrap();
        account_migrations()
            .to_latest(&mut destination_conn)
            .unwrap();

        let result = bootstrap_with_keys(&destination_db_path, &keys, &relay.root_ws_url, |_| {})
            .await
            .unwrap();

        assert_eq!(result.snapshot_seq, 1);
        assert_eq!(result.need, vec![pushed_revision_id.clone()]);

        let (title, markdown, current_rev): (String, String, Option<String>) = destination_conn
            .query_row(
                "SELECT title, markdown, current_rev FROM notes WHERE id = 'note-1'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap();

        assert_eq!(title, "Root Path Title");
        assert_eq!(markdown, "# Root Path Title\n\nLocal Body");
        assert_eq!(current_rev, Some(pushed_revision_id));

        let _ = std::fs::remove_file(source_db_path);
        let _ = std::fs::remove_file(destination_db_path);
        relay.stop();
    }

    #[tokio::test]
    async fn pushes_pinned_local_revision_and_bootstraps_it_into_second_db() {
        if !external_relay_test_prereqs_available() {
            return;
        }

        let keys = Keys::generate();
        let relay = TestRevisionRelay::start(39436).await;

        let temp_dir = std::env::temp_dir();
        let source_db_path = temp_dir.join(format!(
            "comet-revision-pinned-source-test-{}.db",
            std::process::id()
        ));
        let destination_db_path = temp_dir.join(format!(
            "comet-revision-pinned-destination-test-{}.db",
            std::process::id()
        ));
        let _ = std::fs::remove_file(&source_db_path);
        let _ = std::fs::remove_file(&destination_db_path);

        let mut source_conn = Connection::open(&source_db_path).unwrap();
        account_migrations().to_latest(&mut source_conn).unwrap();
        seed_pinned_note(
            &source_conn,
            "note-1",
            "Pinned Title",
            "# Pinned Title\n\nPinned Body",
            250,
        );

        let pushed_revision_id =
            push_local_note_revision(&source_db_path, &keys, &relay.ws_url, "note-1").await;

        let mut destination_conn = Connection::open(&destination_db_path).unwrap();
        account_migrations()
            .to_latest(&mut destination_conn)
            .unwrap();

        let result = bootstrap_with_keys(&destination_db_path, &keys, &relay.ws_url, |_| {})
            .await
            .unwrap();

        assert_eq!(result.snapshot_seq, 1);
        assert_eq!(result.need, vec![pushed_revision_id.clone()]);

        let (title, markdown, current_rev, pinned_at): (
            String,
            String,
            Option<String>,
            Option<i64>,
        ) = destination_conn
            .query_row(
                "SELECT title, markdown, current_rev, pinned_at FROM notes WHERE id = 'note-1'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .unwrap();

        assert_eq!(title, "Pinned Title");
        assert_eq!(markdown, "# Pinned Title\n\nPinned Body");
        assert_eq!(current_rev, Some(pushed_revision_id));
        assert_eq!(pinned_at, Some(250));

        let _ = std::fs::remove_file(source_db_path);
        let _ = std::fs::remove_file(destination_db_path);
        relay.stop();
    }

    #[tokio::test]
    async fn bootstraps_note_deletion_after_destination_already_has_note() {
        if !external_relay_test_prereqs_available() {
            return;
        }

        let keys = Keys::generate();
        let relay = TestRevisionRelay::start(39423).await;

        let temp_dir = std::env::temp_dir();
        let source_db_path = temp_dir.join(format!(
            "comet-revision-delete-source-test-{}.db",
            std::process::id()
        ));
        let destination_db_path = temp_dir.join(format!(
            "comet-revision-delete-destination-test-{}.db",
            std::process::id()
        ));
        let _ = std::fs::remove_file(&source_db_path);
        let _ = std::fs::remove_file(&destination_db_path);

        let mut source_conn = Connection::open(&source_db_path).unwrap();
        account_migrations().to_latest(&mut source_conn).unwrap();
        seed_note(&source_conn, "note-1", "Delete Me", "# Delete Me\n\nBody");

        let initial_revision_id =
            push_local_note_revision(&source_db_path, &keys, &relay.ws_url, "note-1").await;

        let mut destination_conn = Connection::open(&destination_db_path).unwrap();
        account_migrations()
            .to_latest(&mut destination_conn)
            .unwrap();

        let first_bootstrap =
            bootstrap_with_keys(&destination_db_path, &keys, &relay.ws_url, |_| {})
                .await
                .unwrap();

        assert_eq!(first_bootstrap.need, vec![initial_revision_id.clone()]);

        let first_current_rev: Option<String> = destination_conn
            .query_row(
                "SELECT current_rev FROM notes WHERE id = 'note-1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(first_current_rev, Some(initial_revision_id));

        delete_local_note(&source_conn, "note-1");
        let deletion_revision_id =
            push_local_note_deletion_revision(&source_db_path, &keys, &relay.ws_url, "note-1")
                .await;

        let second_bootstrap =
            bootstrap_with_keys(&destination_db_path, &keys, &relay.ws_url, |_| {})
                .await
                .unwrap();

        assert_eq!(second_bootstrap.need, vec![deletion_revision_id.clone()]);

        let remaining_notes: i64 = destination_conn
            .query_row(
                "SELECT COUNT(*) FROM notes WHERE id = 'note-1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(remaining_notes, 0);

        let head_op: String = destination_conn
            .query_row(
                "SELECT op FROM sync_heads WHERE recipient = ?1 AND d_tag = ?2",
                rusqlite::params![keys.public_key().to_hex(), "note-1"],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(head_op, "del");

        let _ = std::fs::remove_file(source_db_path);
        let _ = std::fs::remove_file(destination_db_path);
        relay.stop();
    }

    #[tokio::test]
    async fn receives_live_changes_after_bootstrap() {
        if !external_relay_test_prereqs_available() {
            return;
        }

        let keys = Keys::generate();
        let relay = TestRevisionRelay::start(39424).await;

        let temp_dir = std::env::temp_dir();
        let source_db_path = temp_dir.join(format!(
            "comet-revision-live-source-test-{}.db",
            std::process::id()
        ));
        let destination_db_path = temp_dir.join(format!(
            "comet-revision-live-destination-test-{}.db",
            std::process::id()
        ));
        let _ = std::fs::remove_file(&source_db_path);
        let _ = std::fs::remove_file(&destination_db_path);

        let mut source_conn = Connection::open(&source_db_path).unwrap();
        account_migrations().to_latest(&mut source_conn).unwrap();
        seed_note(
            &source_conn,
            "note-1",
            "Local Title",
            "# Local Title\n\nLocal Body",
        );

        let initial_revision_id =
            push_local_note_revision(&source_db_path, &keys, &relay.ws_url, "note-1").await;

        let mut destination_conn = Connection::open(&destination_db_path).unwrap();
        account_migrations()
            .to_latest(&mut destination_conn)
            .unwrap();

        let mut bootstrap = bootstrap_with_keys(&destination_db_path, &keys, &relay.ws_url, |_| {})
            .await
            .unwrap();

        assert_eq!(bootstrap.need, vec![initial_revision_id]);

        bootstrap
            .connection
            .send_changes(
                "live-sync",
                &bootstrap.author_pubkey,
                bootstrap.snapshot_seq,
                true,
            )
            .await
            .unwrap();

        match bootstrap.connection.recv_message().await.unwrap() {
            RevisionRelayIncomingMessage::ChangesEose {
                subscription_id,
                last_seq,
            } => {
                assert_eq!(subscription_id, "live-sync");
                assert_eq!(last_seq, bootstrap.snapshot_seq);
            }
            other => panic!("unexpected live subscription response: {other:?}"),
        }

        update_note(
            &source_conn,
            "note-1",
            "Updated Title",
            "# Updated Title\n\nUpdated Body",
            400,
        );
        let updated_revision_id =
            push_local_note_revision(&source_db_path, &keys, &relay.ws_url, "note-1").await;

        let (seq, event) = match bootstrap.connection.recv_message().await.unwrap() {
            RevisionRelayIncomingMessage::ChangesEvent {
                subscription_id,
                seq,
                event,
            } => {
                assert_eq!(subscription_id, "live-sync");
                (seq, event)
            }
            other => panic!("unexpected live changes event: {other:?}"),
        };

        let conn = Connection::open(&destination_db_path).unwrap();
        apply_remote_revision_event(&conn, &relay.ws_url, &keys, &event, Some(seq), |_| {})
            .unwrap();

        let (title, markdown, current_rev): (String, String, Option<String>) = destination_conn
            .query_row(
                "SELECT title, markdown, current_rev FROM notes WHERE id = 'note-1'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap();

        assert_eq!(title, "Updated Title");
        assert_eq!(markdown, "# Updated Title\n\nUpdated Body");
        assert_eq!(current_rev, Some(updated_revision_id));

        let _ = std::fs::remove_file(source_db_path);
        let _ = std::fs::remove_file(destination_db_path);
        relay.stop();
    }

    #[tokio::test]
    async fn fails_to_bootstrap_private_mode_relay_without_allowlist() {
        if !external_relay_test_prereqs_available() {
            return;
        }

        let keys = Keys::generate();
        let relay = TestRevisionRelay::start_private(39430).await;

        let temp_dir = std::env::temp_dir();
        let db_path = temp_dir.join(format!(
            "comet-revision-private-bootstrap-fail-test-{}.db",
            std::process::id()
        ));
        let _ = std::fs::remove_file(&db_path);
        let mut conn = Connection::open(&db_path).unwrap();
        account_migrations().to_latest(&mut conn).unwrap();

        let error = match bootstrap_with_keys(&db_path, &keys, &relay.ws_url, |_| {}).await {
            Ok(_) => panic!("expected bootstrap to fail without allowlist"),
            Err(error) => error,
        };

        assert!(
            error.to_string().contains(
                "Relay authentication rejected: restricted: pubkey not authorized on this relay"
            ),
            "unexpected error: {error}"
        );

        let _ = std::fs::remove_file(db_path);
        relay.stop();
    }

    #[tokio::test]
    async fn bootstraps_from_private_mode_relay_after_allowlisting_identity() {
        if !external_relay_test_prereqs_available() {
            return;
        }

        let keys = Keys::generate();
        let relay = TestRevisionRelay::start_private(39431).await;
        relay.allow_pubkey(&keys.public_key().to_hex()).await;

        let event =
            make_remote_note_event(&keys, "note-1", "Private Title", "# Private Title\n\nBody");
        relay.publish_event_with_keys(&keys, &event).await;

        let temp_dir = std::env::temp_dir();
        let db_path = temp_dir.join(format!(
            "comet-revision-private-bootstrap-success-test-{}.db",
            std::process::id()
        ));
        let _ = std::fs::remove_file(&db_path);
        let mut conn = Connection::open(&db_path).unwrap();
        account_migrations().to_latest(&mut conn).unwrap();

        let result = bootstrap_with_keys(&db_path, &keys, &relay.ws_url, |_| {})
            .await
            .unwrap();

        assert_eq!(result.snapshot_seq, 1);
        assert_eq!(result.need.len(), 1);

        let title: String = conn
            .query_row("SELECT title FROM notes WHERE id = 'note-1'", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(title, "Private Title");

        let _ = std::fs::remove_file(db_path);
        relay.stop();
    }

    #[tokio::test]
    async fn receives_live_changes_after_bootstrap_in_private_mode() {
        if !external_relay_test_prereqs_available() {
            return;
        }

        let keys = Keys::generate();
        let relay = TestRevisionRelay::start_private(39432).await;
        relay.allow_pubkey(&keys.public_key().to_hex()).await;

        let temp_dir = std::env::temp_dir();
        let source_db_path = temp_dir.join(format!(
            "comet-revision-private-live-source-test-{}.db",
            std::process::id()
        ));
        let destination_db_path = temp_dir.join(format!(
            "comet-revision-private-live-destination-test-{}.db",
            std::process::id()
        ));
        let _ = std::fs::remove_file(&source_db_path);
        let _ = std::fs::remove_file(&destination_db_path);

        let mut source_conn = Connection::open(&source_db_path).unwrap();
        account_migrations().to_latest(&mut source_conn).unwrap();
        seed_note(
            &source_conn,
            "note-1",
            "Local Title",
            "# Local Title\n\nLocal Body",
        );

        let initial_revision_id =
            push_local_note_revision(&source_db_path, &keys, &relay.ws_url, "note-1").await;

        let mut destination_conn = Connection::open(&destination_db_path).unwrap();
        account_migrations()
            .to_latest(&mut destination_conn)
            .unwrap();

        let mut bootstrap = bootstrap_with_keys(&destination_db_path, &keys, &relay.ws_url, |_| {})
            .await
            .unwrap();

        assert_eq!(bootstrap.need, vec![initial_revision_id]);

        bootstrap
            .connection
            .send_changes(
                "live-sync",
                &bootstrap.author_pubkey,
                bootstrap.snapshot_seq,
                true,
            )
            .await
            .unwrap();

        match bootstrap.connection.recv_message().await.unwrap() {
            RevisionRelayIncomingMessage::ChangesEose {
                subscription_id,
                last_seq,
            } => {
                assert_eq!(subscription_id, "live-sync");
                assert_eq!(last_seq, bootstrap.snapshot_seq);
            }
            other => panic!("unexpected live subscription response: {other:?}"),
        }

        update_note(
            &source_conn,
            "note-1",
            "Updated Title",
            "# Updated Title\n\nUpdated Body",
            400,
        );
        let updated_revision_id =
            push_local_note_revision(&source_db_path, &keys, &relay.ws_url, "note-1").await;

        let (seq, event) = match bootstrap.connection.recv_message().await.unwrap() {
            RevisionRelayIncomingMessage::ChangesEvent {
                subscription_id,
                seq,
                event,
            } => {
                assert_eq!(subscription_id, "live-sync");
                (seq, event)
            }
            other => panic!("unexpected live changes event: {other:?}"),
        };

        let conn = Connection::open(&destination_db_path).unwrap();
        apply_remote_revision_event(&conn, &relay.ws_url, &keys, &event, Some(seq), |_| {})
            .unwrap();

        let (title, markdown, current_rev): (String, String, Option<String>) = destination_conn
            .query_row(
                "SELECT title, markdown, current_rev FROM notes WHERE id = 'note-1'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap();

        assert_eq!(title, "Updated Title");
        assert_eq!(markdown, "# Updated Title\n\nUpdated Body");
        assert_eq!(current_rev, Some(updated_revision_id));

        let _ = std::fs::remove_file(source_db_path);
        let _ = std::fs::remove_file(destination_db_path);
        relay.stop();
    }

    #[tokio::test]
    async fn publishes_locally_while_a_live_changes_subscription_is_active() {
        if !external_relay_test_prereqs_available() {
            return;
        }

        let keys = Keys::generate();
        let relay = TestRevisionRelay::start(39425).await;

        let temp_dir = std::env::temp_dir();
        let db_path = temp_dir.join(format!(
            "comet-revision-live-publish-test-{}.db",
            std::process::id()
        ));
        let _ = std::fs::remove_file(&db_path);

        let mut conn = Connection::open(&db_path).unwrap();
        account_migrations().to_latest(&mut conn).unwrap();
        seed_note(&conn, "note-1", "Initial Title", "# Initial Title\n\nBody");

        let initial_revision_id =
            push_local_note_revision(&db_path, &keys, &relay.ws_url, "note-1").await;

        let mut live_connection =
            RevisionRelayConnection::connect_authenticated(&relay.ws_url, &keys)
                .await
                .unwrap();
        live_connection
            .send_changes("live-sync", &keys.public_key().to_hex(), 1, true)
            .await
            .unwrap();

        match live_connection.recv_message().await.unwrap() {
            RevisionRelayIncomingMessage::ChangesEose {
                subscription_id,
                last_seq,
            } => {
                assert_eq!(subscription_id, "live-sync");
                assert_eq!(last_seq, 1);
            }
            other => panic!("unexpected live subscription response: {other:?}"),
        }

        update_note(
            &conn,
            "note-1",
            "Updated Title",
            "# Updated Title\n\nUpdated Body",
            400,
        );
        let updated_revision_id =
            push_local_note_revision(&db_path, &keys, &relay.ws_url, "note-1").await;

        assert_ne!(initial_revision_id, updated_revision_id);

        match live_connection.recv_message().await.unwrap() {
            RevisionRelayIncomingMessage::ChangesEvent {
                subscription_id,
                seq,
                event,
            } => {
                assert_eq!(subscription_id, "live-sync");
                assert_eq!(seq, 2);
                let parsed = parse_note_revision_event(&keys, &event).unwrap();
                assert_eq!(parsed.revision_id, updated_revision_id);
            }
            other => panic!("unexpected live changes event: {other:?}"),
        }

        let _ = std::fs::remove_file(db_path);
        relay.stop();
    }

    #[tokio::test]
    async fn bootstraps_additive_state_from_two_relays() {
        if !external_relay_test_prereqs_available() {
            return;
        }

        let keys = Keys::generate();
        let relay_a = TestRevisionRelay::start(39426).await;
        let relay_b = TestRevisionRelay::start(39427).await;

        let event_a = make_remote_note_event(&keys, "note-1", "Relay A", "# Relay A\n\nBody A");
        let event_b = make_remote_note_event(&keys, "note-2", "Relay B", "# Relay B\n\nBody B");
        relay_a.publish_event(&event_a).await;
        relay_b.publish_event(&event_b).await;

        let temp_dir = std::env::temp_dir();
        let db_path = temp_dir.join(format!(
            "comet-revision-multi-relay-additive-test-{}.db",
            std::process::id()
        ));
        let _ = std::fs::remove_file(&db_path);
        let mut conn = Connection::open(&db_path).unwrap();
        account_migrations().to_latest(&mut conn).unwrap();

        let first = bootstrap_with_keys(&db_path, &keys, &relay_a.ws_url, |_| {})
            .await
            .unwrap();
        let second = bootstrap_with_keys(&db_path, &keys, &relay_b.ws_url, |_| {})
            .await
            .unwrap();

        assert_eq!(first.need.len(), 1);
        assert_eq!(second.need.len(), 1);

        let note_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM notes", [], |row| row.get(0))
            .unwrap();
        assert_eq!(note_count, 2);

        let state_a = get_sync_relay_state(&conn, &relay_a.ws_url)
            .unwrap()
            .unwrap();
        let state_b = get_sync_relay_state(&conn, &relay_b.ws_url)
            .unwrap()
            .unwrap();
        assert_eq!(state_a.snapshot_seq, Some(1));
        assert_eq!(state_b.snapshot_seq, Some(1));

        let _ = std::fs::remove_file(db_path);
        relay_a.stop();
        relay_b.stop();
    }

    #[tokio::test]
    async fn does_not_refetch_same_logical_revision_from_second_relay() {
        if !external_relay_test_prereqs_available() {
            return;
        }

        let keys = Keys::generate();
        let relay_a = TestRevisionRelay::start(39428).await;
        let relay_b = TestRevisionRelay::start(39429).await;

        let event_a = make_remote_note_event(
            &keys,
            "note-1",
            "Same Revision",
            "# Same Revision\n\nShared Body",
        );
        let event_b = make_remote_note_event(
            &keys,
            "note-1",
            "Same Revision",
            "# Same Revision\n\nShared Body",
        );
        assert_ne!(event_a.id, event_b.id);

        relay_a.publish_event(&event_a).await;
        relay_b.publish_event(&event_b).await;

        let temp_dir = std::env::temp_dir();
        let db_path = temp_dir.join(format!(
            "comet-revision-multi-relay-dedupe-test-{}.db",
            std::process::id()
        ));
        let _ = std::fs::remove_file(&db_path);
        let mut conn = Connection::open(&db_path).unwrap();
        account_migrations().to_latest(&mut conn).unwrap();

        let first = bootstrap_with_keys(&db_path, &keys, &relay_a.ws_url, |_| {})
            .await
            .unwrap();
        let second = bootstrap_with_keys(&db_path, &keys, &relay_b.ws_url, |_| {})
            .await
            .unwrap();

        assert_eq!(first.need.len(), 1);
        assert!(second.need.is_empty());
        assert!(second.have.is_empty());

        let note_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM notes WHERE id = 'note-1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(note_count, 1);

        let revision_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sync_revisions WHERE recipient = ?1",
                rusqlite::params![keys.public_key().to_hex()],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(revision_count, 1);

        let state_a = get_sync_relay_state(&conn, &relay_a.ws_url)
            .unwrap()
            .unwrap();
        let state_b = get_sync_relay_state(&conn, &relay_b.ws_url)
            .unwrap()
            .unwrap();
        assert_eq!(state_a.snapshot_seq, Some(1));
        assert_eq!(state_b.snapshot_seq, Some(1));

        let _ = std::fs::remove_file(db_path);
        relay_a.stop();
        relay_b.stop();
    }

    #[tokio::test]
    async fn bootstraps_additive_state_from_open_and_private_relays() {
        if !external_relay_test_prereqs_available() {
            return;
        }

        let keys = Keys::generate();
        let relay_open = TestRevisionRelay::start(39433).await;
        let relay_private = TestRevisionRelay::start_private(39434).await;
        relay_private
            .allow_pubkey(&keys.public_key().to_hex())
            .await;

        let event_open = make_remote_note_event(&keys, "note-1", "Open Relay", "# Open\n\nBody");
        let event_private =
            make_remote_note_event(&keys, "note-2", "Private Relay", "# Private\n\nBody");
        relay_open.publish_event(&event_open).await;
        relay_private
            .publish_event_with_keys(&keys, &event_private)
            .await;

        let temp_dir = std::env::temp_dir();
        let db_path = temp_dir.join(format!(
            "comet-revision-mixed-access-test-{}.db",
            std::process::id()
        ));
        let _ = std::fs::remove_file(&db_path);
        let mut conn = Connection::open(&db_path).unwrap();
        account_migrations().to_latest(&mut conn).unwrap();

        let first = bootstrap_with_keys(&db_path, &keys, &relay_open.ws_url, |_| {})
            .await
            .unwrap();
        let second = bootstrap_with_keys(&db_path, &keys, &relay_private.ws_url, |_| {})
            .await
            .unwrap();

        assert_eq!(first.need.len(), 1);
        assert_eq!(second.need.len(), 1);

        let note_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM notes", [], |row| row.get(0))
            .unwrap();
        assert_eq!(note_count, 2);

        let _ = std::fs::remove_file(db_path);
        relay_open.stop();
        relay_private.stop();
    }

    struct TestRevisionRelay {
        child: Child,
        ws_url: String,
        root_ws_url: String,
        http_url: String,
        admin_token: Option<String>,
        _db_name: String,
    }

    impl TestRevisionRelay {
        async fn start(port: u16) -> Self {
            Self::start_with_options(port, false).await
        }

        async fn start_private(port: u16) -> Self {
            Self::start_with_options(port, true).await
        }

        async fn start_with_options(port: u16, private_mode: bool) -> Self {
            let db_name = format!("relay_app_test_{port}_{}", std::process::id());
            create_database(&db_name);

            let repo_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("../..")
                .canonicalize()
                .unwrap();
            let relay_dir = repo_root.join("relay");
            let root_ws_url = format!("ws://127.0.0.1:{port}");
            let ws_url = format!("{root_ws_url}/ws");
            let http_url = format!("http://127.0.0.1:{port}");

            let mut command = Command::new("bun");
            command
                .arg("run")
                .arg("src/index.ts")
                .current_dir(&relay_dir)
                .env("HOST", "127.0.0.1")
                .env("PORT", port.to_string())
                .env("DATABASE_URL", database_url_for(&db_name))
                .env("RELAY_URL", &root_ws_url)
                .stdout(Stdio::null())
                .stderr(Stdio::null());

            if private_mode {
                command
                    .env("PRIVATE_MODE", "true")
                    .env("RELAY_ADMIN_TOKEN", TEST_ADMIN_TOKEN);
            }

            let child = command.spawn().unwrap();

            wait_for_healthz(&format!("{http_url}/healthz")).await;

            Self {
                child,
                ws_url,
                root_ws_url,
                http_url,
                admin_token: if private_mode {
                    Some(TEST_ADMIN_TOKEN.to_string())
                } else {
                    None
                },
                _db_name: db_name,
            }
        }

        async fn publish_event(&self, event: &Event) {
            let mut connection = RevisionRelayConnection::connect(&self.ws_url)
                .await
                .unwrap();
            connection.send_event(event).await.unwrap();
            let response = connection.recv_message().await.unwrap();
            match response {
                RevisionRelayIncomingMessage::Ok { accepted, .. } => assert!(accepted),
                other => panic!("unexpected publish response: {other:?}"),
            }
        }

        async fn publish_event_with_keys(&self, keys: &Keys, event: &Event) {
            let mut connection = RevisionRelayConnection::connect_authenticated(&self.ws_url, keys)
                .await
                .unwrap();
            connection.send_event(event).await.unwrap();
            let response = connection.recv_message().await.unwrap();
            match response {
                RevisionRelayIncomingMessage::Ok { accepted, .. } => assert!(accepted),
                other => panic!("unexpected publish response: {other:?}"),
            }
        }

        async fn allow_pubkey(&self, pubkey: &str) {
            let admin_token = self
                .admin_token
                .as_ref()
                .expect("private relay should have an admin token");

            let response = Client::new()
                .post(format!("{}/admin/allowlist", self.http_url))
                .bearer_auth(admin_token)
                .header("Content-Type", "application/json")
                .body(format!(r#"{{"pubkey":"{pubkey}"}}"#))
                .send()
                .await
                .unwrap();

            assert!(
                response.status().is_success(),
                "unexpected allowlist response status: {}",
                response.status()
            );
        }

        fn stop(mut self) {
            let _ = self.child.kill();
            let _ = self.child.wait();
            drop_database(&self._db_name);
        }
    }

    fn make_remote_note_event(keys: &Keys, note_id: &str, _title: &str, markdown: &str) -> Event {
        let payload = NoteRevisionPayload {
            version: 1,
            markdown: markdown.to_string(),
            note_created_at: 100,
            edited_at: 200,
            archived_at: None,
            pinned_at: None,
            readonly: false,
            tags: vec![],
            attachments: vec![],
        };
        let revision_id = compute_note_revision_id(
            note_id,
            &[],
            "put",
            Some(COMET_NOTE_COLLECTION),
            Some(&payload),
        )
        .unwrap();

        build_note_revision_event(
            keys,
            &NoteRevisionEventMeta {
                document_id: note_id.to_string(),
                revision_id,
                parent_revision_ids: vec![],
                operation: "put".to_string(),
                collection: Some(COMET_NOTE_COLLECTION.to_string()),
                created_at_ms: Some(200),
            },
            Some(&payload),
        )
        .unwrap()
    }

    async fn push_local_note_revision(
        db_path: &Path,
        keys: &Keys,
        relay_ws_url: &str,
        note_id: &str,
    ) -> String {
        let author_pubkey = keys.public_key();
        let (event, revision_id) = {
            let conn = Connection::open(db_path).unwrap();
            let pending =
                build_pending_note_revision(&conn, keys, &author_pubkey, note_id).unwrap();
            persist_local_note_revision(&conn, &pending).unwrap();
            let event = pending.event;
            (event, pending.revision_id)
        };

        let mut connection = RevisionRelayConnection::connect_authenticated(relay_ws_url, keys)
            .await
            .unwrap();
        connection.send_event(&event).await.unwrap();
        let response = connection.recv_message().await.unwrap();
        match response {
            RevisionRelayIncomingMessage::Ok { accepted, .. } => assert!(accepted),
            other => panic!("unexpected publish response: {other:?}"),
        }

        let conn = Connection::open(db_path).unwrap();
        conn.execute(
            "UPDATE notes SET sync_event_id = ?1, locally_modified = 0 WHERE id = ?2",
            rusqlite::params![event.id.to_hex(), note_id],
        )
        .unwrap();

        revision_id
    }

    async fn push_local_note_deletion_revision(
        db_path: &Path,
        keys: &Keys,
        relay_ws_url: &str,
        note_id: &str,
    ) -> String {
        let author_pubkey = keys.public_key();
        let (event, revision_id) = {
            let conn = Connection::open(db_path).unwrap();
            let pending =
                build_pending_note_deletion_revision(&conn, keys, &author_pubkey, note_id, 300)
                    .unwrap();
            persist_local_deletion_revision(&conn, &pending).unwrap();
            let event = pending.event;
            (event, pending.revision_id)
        };

        publish_local_event(relay_ws_url, keys, &event).await;
        revision_id
    }

    async fn publish_local_event(relay_ws_url: &str, keys: &Keys, event: &Event) {
        let mut connection = RevisionRelayConnection::connect_authenticated(relay_ws_url, keys)
            .await
            .unwrap();
        connection.send_event(event).await.unwrap();
        let response = connection.recv_message().await.unwrap();
        match response {
            RevisionRelayIncomingMessage::Ok { accepted, .. } => assert!(accepted),
            other => panic!("unexpected publish response: {other:?}"),
        }
    }

    fn seed_note(conn: &Connection, note_id: &str, title: &str, markdown: &str) {
        conn.execute(
            "INSERT INTO notes (id, title, markdown, created_at, modified_at, edited_at, locally_modified)
             VALUES (?1, ?2, ?3, 100, 200, 200, 1)",
            rusqlite::params![note_id, title, markdown],
        )
        .unwrap();
    }

    fn seed_pinned_note(
        conn: &Connection,
        note_id: &str,
        title: &str,
        markdown: &str,
        pinned_at: i64,
    ) {
        conn.execute(
            "INSERT INTO notes (id, title, markdown, created_at, modified_at, edited_at, pinned_at, locally_modified)
             VALUES (?1, ?2, ?3, 100, 200, 200, ?4, 1)",
            rusqlite::params![note_id, title, markdown, pinned_at],
        )
        .unwrap();
    }

    fn delete_local_note(conn: &Connection, note_id: &str) {
        conn.execute(
            "DELETE FROM notes_fts WHERE note_id = ?1",
            rusqlite::params![note_id],
        )
        .unwrap();
        conn.execute(
            "DELETE FROM note_tag_links WHERE note_id = ?1",
            rusqlite::params![note_id],
        )
        .unwrap();
        conn.execute(
            "DELETE FROM notes WHERE id = ?1",
            rusqlite::params![note_id],
        )
        .unwrap();
    }

    fn update_note(
        conn: &Connection,
        note_id: &str,
        title: &str,
        markdown: &str,
        modified_at: i64,
    ) {
        conn.execute(
            "UPDATE notes
             SET title = ?1, markdown = ?2, modified_at = ?3, edited_at = ?3, locally_modified = 1
             WHERE id = ?4",
            rusqlite::params![title, markdown, modified_at, note_id],
        )
        .unwrap();
    }

    fn create_database(database_name: &str) {
        assert_valid_database_name(database_name);

        let database_name = database_name.to_string();
        thread::spawn(move || {
            let mut client = PgClient::connect(&database_url_for("postgres"), NoTls).unwrap();
            client
                .simple_query(&format!("CREATE DATABASE \"{database_name}\""))
                .unwrap();
        })
        .join()
        .unwrap();
    }

    fn drop_database(database_name: &str) {
        assert_valid_database_name(database_name);

        let database_name = database_name.to_string();
        let _ = thread::spawn(move || {
            if let Ok(mut client) = PgClient::connect(&database_url_for("postgres"), NoTls) {
                let _ = client.simple_query(&format!(
                    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '{database_name}' AND pid <> pg_backend_pid();"
                ));
                let _ = client.simple_query(&format!("DROP DATABASE IF EXISTS \"{database_name}\""));
            }
        })
        .join();
    }

    fn database_url_for(database_name: &str) -> String {
        let base = std::env::var("TEST_DATABASE_URL")
            .unwrap_or_else(|_| "postgres://localhost:5432/postgres".to_string());
        let mut url = Url::parse(&base).unwrap();
        url.set_path(&format!("/{database_name}"));
        url.to_string()
    }

    async fn wait_for_healthz(url: &str) {
        let client = reqwest::Client::new();
        for _ in 0..50 {
            if let Ok(response) = client.get(url).send().await {
                if response.status().is_success() {
                    return;
                }
            }
            thread::sleep(Duration::from_millis(100));
        }
        panic!("relay did not become healthy");
    }

    fn external_relay_test_prereqs_available() -> bool {
        let has_test_database = std::env::var("TEST_DATABASE_URL")
            .ok()
            .is_some_and(|value| !value.trim().is_empty());
        let has_bun = Command::new("bun")
            .arg("--version")
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .is_ok();

        let available = has_test_database && has_bun;
        if !available {
            EXTERNAL_TEST_PREREQ_WARNING.call_once(|| {
                eprintln!(
                    "skipping revision relay process tests: TEST_DATABASE_URL and bun are required"
                );
            });
        }

        available
    }

    fn assert_valid_database_name(database_name: &str) {
        assert!(
            database_name
                .chars()
                .all(|ch| ch.is_ascii_alphanumeric() || ch == '_'),
            "unexpected test database name: {database_name}"
        );
    }
}

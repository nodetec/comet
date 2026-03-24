use crate::adapters::nostr::relay_client::{RevisionRelayConnection, RevisionRelayIncomingMessage};
use crate::adapters::sqlite::revision_sync_repository::{
    get_sync_head, list_sync_revision_parents,
};
use crate::db::database_connection;
use crate::domain::sync::revision_codec::{
    revision_envelope_tags, RevisionEnvelopeMeta, REVISION_SYNC_SCHEMA_VERSION,
};
use crate::domain::sync::revision_service::{
    build_pending_note_deletion_revision, build_pending_note_revision,
    build_pending_notebook_deletion_revision, build_pending_notebook_revision,
    persist_local_deletion_revision, persist_local_note_revision, persist_local_notebook_revision,
};
use crate::error::AppError;
use nostr_sdk::prelude::*;
use tauri::AppHandle;

use super::sync_manager::sync_log;

pub async fn push_note_revision(
    app: &AppHandle,
    active_relay_url: &str,
    backup_relay_urls: &[String],
    keys: &Keys,
    note_id: &str,
) -> Result<(), AppError> {
    let recipient = keys.public_key();
    let event = {
        let conn = database_connection(app)?;
        let pending = build_pending_note_revision(&conn, keys, &recipient, note_id)?;
        persist_local_note_revision(&conn, &pending)?;
        crate::adapters::nostr::nip59_ext::gift_wrap(keys, &recipient, pending.rumor, pending.tags)?
    };

    let fanout = send_event_to_relays(active_relay_url, backup_relay_urls, keys, &event).await?;

    let conn = database_connection(app)?;
    conn.execute(
        "UPDATE notes SET sync_event_id = ?1, locally_modified = 0 WHERE id = ?2",
        rusqlite::params![event.id.to_hex(), note_id],
    )?;

    sync_log(
        app,
        &format!(
            "pushed revision note {note_id} to {}/{} relays",
            fanout.success_count, fanout.relay_count
        ),
    );
    Ok(())
}

pub async fn push_notebook_revision(
    app: &AppHandle,
    active_relay_url: &str,
    backup_relay_urls: &[String],
    keys: &Keys,
    notebook_id: &str,
) -> Result<(), AppError> {
    let recipient = keys.public_key();
    let event = {
        let conn = database_connection(app)?;
        let pending = build_pending_notebook_revision(&conn, keys, &recipient, notebook_id)?;
        persist_local_notebook_revision(&conn, &pending)?;
        crate::adapters::nostr::nip59_ext::gift_wrap(keys, &recipient, pending.rumor, pending.tags)?
    };

    let fanout = send_event_to_relays(active_relay_url, backup_relay_urls, keys, &event).await?;

    let conn = database_connection(app)?;
    conn.execute(
        "UPDATE notebooks SET sync_event_id = ?1, locally_modified = 0 WHERE id = ?2",
        rusqlite::params![event.id.to_hex(), notebook_id],
    )?;

    sync_log(
        app,
        &format!(
            "pushed revision notebook {notebook_id} to {}/{} relays",
            fanout.success_count, fanout.relay_count
        ),
    );
    Ok(())
}

pub async fn push_deletion_revision(
    app: &AppHandle,
    active_relay_url: &str,
    backup_relay_urls: &[String],
    keys: &Keys,
    entity_id: &str,
) -> Result<(), AppError> {
    let recipient = keys.public_key();
    let recipient_hex = recipient.to_hex();
    let event = {
        let conn = database_connection(app)?;
        let pending = if entity_id.starts_with("notebook-") {
            let pending = build_pending_notebook_deletion_revision(
                &conn,
                keys,
                &recipient,
                entity_id,
                crate::domain::common::time::now_millis(),
            )?;
            persist_local_deletion_revision(&conn, &pending)?;
            pending
        } else {
            let pending = build_pending_note_deletion_revision(
                &conn,
                keys,
                &recipient,
                entity_id,
                crate::domain::common::time::now_millis(),
            )?;
            persist_local_deletion_revision(&conn, &pending)?;
            pending
        };

        let head = get_sync_head(&conn, &recipient_hex, &pending.d_tag)?
            .ok_or_else(|| AppError::custom("Missing sync head for deletion revision"))?;
        let parent_revision_ids =
            list_sync_revision_parents(&conn, &recipient_hex, &pending.d_tag, &head.rev)?;
        let tags = revision_envelope_tags(&RevisionEnvelopeMeta {
            recipient: recipient_hex.clone(),
            d_tag: pending.d_tag.clone(),
            revision_id: head.rev,
            parent_revision_ids,
            op: "del".to_string(),
            mtime: head.mtime,
            entity_type: Some(pending.entity_type.clone()),
            schema_version: REVISION_SYNC_SCHEMA_VERSION.to_string(),
        });

        crate::adapters::nostr::nip59_ext::gift_wrap(keys, &recipient, pending.rumor, tags)?
    };

    let fanout = send_event_to_relays(active_relay_url, backup_relay_urls, keys, &event).await?;

    let conn = database_connection(app)?;
    let _ = conn.execute(
        "DELETE FROM pending_deletions WHERE entity_id = ?1",
        rusqlite::params![entity_id],
    );

    sync_log(
        app,
        &format!(
            "pushed revision delete {entity_id} to {}/{} relays",
            fanout.success_count, fanout.relay_count
        ),
    );
    Ok(())
}

#[derive(Debug)]
struct RelayFanoutResult {
    success_count: usize,
    relay_count: usize,
}

async fn send_event_to_relays(
    active_relay_url: &str,
    backup_relay_urls: &[String],
    keys: &Keys,
    event: &Event,
) -> Result<RelayFanoutResult, AppError> {
    let mut success_count = 0usize;
    let relay_count = 1 + backup_relay_urls.len();

    match RevisionRelayConnection::connect_authenticated(active_relay_url, keys).await {
        Ok(mut connection) => {
            if send_event_on_connection(&mut connection, event).await? {
                success_count += 1;
            }
        }
        Err(error) => {
            eprintln!(
                "[sync] revision active push connect error relay={active_relay_url}: {error}"
            );
        }
    }

    for relay_url in backup_relay_urls {
        match RevisionRelayConnection::connect_authenticated(relay_url, keys).await {
            Ok(mut connection) => match send_event_on_connection(&mut connection, event).await {
                Ok(true) => {
                    success_count += 1;
                }
                Ok(false) => {}
                Err(error) => {
                    eprintln!("[sync] revision backup push error relay={relay_url}: {error}");
                }
            },
            Err(error) => {
                eprintln!("[sync] revision backup connect error relay={relay_url}: {error}");
            }
        }
    }

    if success_count == 0 {
        return Err(AppError::custom(
            "Revision push failed on every configured sync relay",
        ));
    }

    Ok(RelayFanoutResult {
        success_count,
        relay_count,
    })
}

async fn send_event_on_connection(
    connection: &mut RevisionRelayConnection,
    event: &Event,
) -> Result<bool, AppError> {
    connection.send_event(event).await?;
    match connection.recv_message().await? {
        RevisionRelayIncomingMessage::Ok { accepted: true, .. } => Ok(true),
        RevisionRelayIncomingMessage::Ok {
            accepted: false,
            message,
            ..
        } if message.starts_with("duplicate:") => Ok(true),
        RevisionRelayIncomingMessage::Ok {
            accepted: false,
            message,
            ..
        } => Err(AppError::custom(format!(
            "Revision relay rejected event: {message}"
        ))),
        other => Err(AppError::custom(format!(
            "Unexpected relay publish response: {other:?}"
        ))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::sync::revision_codec::{
        build_revision_note_rumor, canonicalize_revision_payload, compute_document_d_tag,
        compute_revision_id, revision_envelope_tags, RevisionEnvelopeMeta, RevisionRumorInput,
        REVISION_SYNC_SCHEMA_VERSION,
    };
    use postgres::{Client as PgClient, NoTls};
    use reqwest::Client;
    use std::path::PathBuf;
    use std::process::{Child, Command, Stdio};
    use std::sync::Once;
    use std::thread;
    use std::time::Duration;
    use ::url::Url;

    const TEST_ADMIN_TOKEN: &str = "test-admin-token";
    static EXTERNAL_TEST_PREREQ_WARNING: Once = Once::new();

    #[tokio::test]
    async fn send_event_to_relays_succeeds_when_active_relay_is_unavailable() {
        if !external_relay_test_prereqs_available() {
            return;
        }

        let keys = Keys::generate();
        let backup = TestRevisionRelay::start(39437).await;
        let event = make_remote_note_event(&keys, "note-1", "Fallback", "# Fallback\n\nBody");

        let result = send_event_to_relays(
            "ws://127.0.0.1:39999/ws",
            std::slice::from_ref(&backup.ws_url),
            &keys,
            &event,
        )
        .await
        .unwrap();

        assert_eq!(result.success_count, 1);
        assert_eq!(result.relay_count, 2);

        backup.stop();
    }

    #[tokio::test]
    async fn send_event_to_relays_succeeds_when_active_private_relay_rejects_auth() {
        if !external_relay_test_prereqs_available() {
            return;
        }

        let keys = Keys::generate();
        let active_private = TestRevisionRelay::start_private(39438).await;
        let backup = TestRevisionRelay::start(39439).await;
        let event = make_remote_note_event(
            &keys,
            "note-1",
            "Backup Accepts",
            "# Backup Accepts\n\nBody",
        );

        let result = send_event_to_relays(
            &active_private.ws_url,
            std::slice::from_ref(&backup.ws_url),
            &keys,
            &event,
        )
        .await
        .unwrap();

        assert_eq!(result.success_count, 1);
        assert_eq!(result.relay_count, 2);

        active_private.stop();
        backup.stop();
    }

    #[tokio::test]
    async fn send_event_to_relays_fails_when_all_relays_fail() {
        if !external_relay_test_prereqs_available() {
            return;
        }

        let keys = Keys::generate();
        let private_backup = TestRevisionRelay::start_private(39440).await;
        let event = make_remote_note_event(&keys, "note-1", "No Relay", "# No Relay\n\nBody");

        let error = send_event_to_relays(
            "ws://127.0.0.1:39998/ws",
            std::slice::from_ref(&private_backup.ws_url),
            &keys,
            &event,
        )
        .await
        .unwrap_err();

        assert!(
            error
                .to_string()
                .contains("Revision push failed on every configured sync relay"),
            "unexpected error: {error}"
        );

        private_backup.stop();
    }

    struct TestRevisionRelay {
        child: Child,
        ws_url: String,
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
            let db_name = format!("relay_push_test_{port}_{}", std::process::id());
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
                _db_name: db_name,
            }
        }

        fn stop(mut self) {
            let _ = self.child.kill();
            let _ = self.child.wait();
            drop_database(&self._db_name);
        }
    }

    fn make_remote_note_event(keys: &Keys, note_id: &str, title: &str, markdown: &str) -> Event {
        let recipient = keys.public_key();
        let d_tag = compute_document_d_tag(keys.secret_key(), note_id);
        let canonical = canonicalize_revision_payload(
            &recipient.to_hex(),
            &d_tag,
            &[],
            "put",
            "note",
            title,
            markdown,
            None,
            100,
            200,
            200,
            None,
            None,
            None,
            false,
            &[],
        )
        .unwrap();
        let revision_id = compute_revision_id(keys.secret_key(), &canonical).unwrap();
        let rumor = build_revision_note_rumor(
            RevisionRumorInput {
                document_id: note_id,
                title,
                markdown,
                notebook_id: None,
                created_at: 100,
                modified_at: 200,
                edited_at: 200,
                archived_at: None,
                deleted_at: None,
                pinned_at: None,
                readonly: false,
                tags: &[],
                entity_type: "note",
                parent_revision_ids: &[],
                op: "put",
            },
            keys.public_key(),
        );

        crate::adapters::nostr::nip59_ext::gift_wrap(
            keys,
            &recipient,
            rumor,
            revision_envelope_tags(&RevisionEnvelopeMeta {
                recipient: recipient.to_hex(),
                d_tag,
                revision_id,
                parent_revision_ids: vec![],
                op: "put".into(),
                mtime: 200,
                entity_type: Some("note".into()),
                schema_version: REVISION_SYNC_SCHEMA_VERSION.into(),
            }),
        )
        .unwrap()
    }

    fn external_relay_test_prereqs_available() -> bool {
        let has_test_database = std::env::var("TEST_DATABASE_URL")
            .ok()
            .filter(|value| !value.trim().is_empty())
            .is_some();
        let has_bun = Command::new("bun")
            .arg("--version")
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .map(|status| status.success())
            .unwrap_or(false);

        if has_test_database && has_bun {
            true
        } else {
            EXTERNAL_TEST_PREREQ_WARNING.call_once(|| {
                eprintln!("skipping revision relay process tests: TEST_DATABASE_URL and bun are required");
            });
            false
        }
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
        let client = Client::new();
        for _ in 0..50 {
            if let Ok(response) = client.get(url).send().await {
                if response.status().is_success() {
                    return;
                }
            }
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
        panic!("relay never became healthy: {url}");
    }

    fn assert_valid_database_name(name: &str) {
        assert!(
            !name.is_empty()
                && name
                    .chars()
                    .all(|character| character.is_ascii_lowercase()
                        || character.is_ascii_digit()
                        || character == '_'),
            "invalid database name: {name}"
        );
    }
}

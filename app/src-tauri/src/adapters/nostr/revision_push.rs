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
            entity_type: pending.entity_type.clone(),
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

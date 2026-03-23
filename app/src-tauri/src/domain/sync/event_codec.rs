use crate::domain::common::text::strip_title_line;
use crate::domain::sync::model::{SyncedNote, SyncedNotebook};
use crate::error::AppError;
use nostr_sdk::prelude::*;

pub const COMET_EVENT_KIND: Kind = Kind::ApplicationSpecificData; // 30078
pub const COMET_SCHEMA_VERSION: &str = "1";
pub const COMET_CLIENT: &str = "comet";

pub fn comet_base_tags() -> Vec<Tag> {
    vec![
        Tag::custom(TagKind::custom("client"), vec![COMET_CLIENT.to_string()]),
        Tag::custom(TagKind::custom("v"), vec![COMET_SCHEMA_VERSION.to_string()]),
    ]
}

// ── Notebook codec ──────────────────────────────────────────────────────

pub fn notebook_to_rumor(
    notebook_id: &str,
    name: &str,
    updated_at: i64,
    pubkey: PublicKey,
) -> UnsignedEvent {
    let mut tags = comet_base_tags();
    tags.extend([
        Tag::identifier(notebook_id),
        Tag::title(name),
        Tag::custom(TagKind::custom("type"), vec!["notebook".to_string()]),
        Tag::custom(TagKind::custom("modified_at"), vec![updated_at.to_string()]),
    ]);

    EventBuilder::new(COMET_EVENT_KIND, "")
        .tags(tags)
        .build(pubkey)
}

pub fn rumor_to_synced_notebook(rumor: &UnsignedEvent) -> Result<SyncedNotebook, AppError> {
    let id = rumor
        .tags
        .find(TagKind::d())
        .and_then(|t| t.content())
        .map(std::string::ToString::to_string)
        .ok_or_else(|| AppError::custom("Missing d tag in notebook event"))?;

    let name = rumor
        .tags
        .find(TagKind::Title)
        .and_then(|t| t.content())
        .map(std::string::ToString::to_string)
        .ok_or_else(|| AppError::custom("Missing title tag in notebook event"))?;

    let updated_at = rumor
        .tags
        .find(TagKind::custom("modified_at"))
        .and_then(|t| t.content())
        .and_then(|s| s.parse::<i64>().ok())
        .unwrap_or_else(|| rumor.created_at.as_secs() as i64 * 1000);

    Ok(SyncedNotebook {
        id,
        name,
        updated_at,
    })
}

pub fn is_notebook_rumor(rumor: &UnsignedEvent) -> bool {
    rumor.kind == COMET_EVENT_KIND
        && rumor
            .tags
            .find(TagKind::custom("type"))
            .and_then(|t| t.content())
            == Some("notebook")
}

// ── Note codec ──────────────────────────────────────────────────────────

pub fn note_to_rumor(
    note_id: &str,
    title: &str,
    markdown: &str,
    modified_at: i64,
    edited_at: i64,
    created_at: i64,
    notebook_id: Option<&str>,
    archived_at: Option<i64>,
    deleted_at: Option<i64>,
    pinned_at: Option<i64>,
    readonly: bool,
    tags: &[String],
    blob_tags: &[(String, String, String)], // (plaintext_hash, ciphertext_hash, encryption_key_hex)
    pubkey: PublicKey,
) -> UnsignedEvent {
    let content = strip_title_line(markdown);

    let mut event_tags = comet_base_tags();
    event_tags.extend([
        Tag::identifier(note_id),
        Tag::custom(TagKind::custom("type"), vec!["note".to_string()]),
        Tag::title(title),
        Tag::custom(
            TagKind::custom("modified_at"),
            vec![modified_at.to_string()],
        ),
        Tag::custom(TagKind::custom("edited_at"), vec![edited_at.to_string()]),
        Tag::custom(TagKind::custom("created_at"), vec![created_at.to_string()]),
    ]);

    if let Some(nb_id) = notebook_id {
        event_tags.push(Tag::custom(
            TagKind::custom("notebook_id"),
            vec![nb_id.to_string()],
        ));
    }

    if let Some(ts) = archived_at {
        event_tags.push(Tag::custom(
            TagKind::custom("archived_at"),
            vec![ts.to_string()],
        ));
    }

    if let Some(ts) = deleted_at {
        event_tags.push(Tag::custom(
            TagKind::custom("deleted_at"),
            vec![ts.to_string()],
        ));
    }

    if let Some(ts) = pinned_at {
        event_tags.push(Tag::custom(
            TagKind::custom("pinned_at"),
            vec![ts.to_string()],
        ));
    }

    if readonly {
        event_tags.push(Tag::custom(
            TagKind::custom("readonly"),
            vec!["true".to_string()],
        ));
    }

    for t in tags {
        event_tags.push(Tag::hashtag(t));
    }

    for (plaintext_hash, ciphertext_hash, key_hex) in blob_tags {
        event_tags.push(Tag::custom(
            TagKind::custom("blob"),
            vec![
                plaintext_hash.clone(),
                ciphertext_hash.clone(),
                key_hex.clone(),
            ],
        ));
    }

    EventBuilder::new(COMET_EVENT_KIND, content)
        .tags(event_tags)
        .build(pubkey)
}

pub fn rumor_to_synced_note(rumor: &UnsignedEvent) -> Result<SyncedNote, AppError> {
    let note_id = rumor
        .tags
        .find(TagKind::d())
        .and_then(|t| t.content())
        .map(std::string::ToString::to_string)
        .ok_or_else(|| AppError::custom("Missing d tag in synced event"))?;

    let title = rumor
        .tags
        .find(TagKind::Title)
        .and_then(|t| t.content())
        .map(std::string::ToString::to_string)
        .unwrap_or_default();

    let modified_at = rumor
        .tags
        .find(TagKind::custom("modified_at"))
        .and_then(|t| t.content())
        .and_then(|s| s.parse::<i64>().ok())
        .unwrap_or_else(|| rumor.created_at.as_secs() as i64 * 1000);

    let edited_at = rumor
        .tags
        .find(TagKind::custom("edited_at"))
        .and_then(|t| t.content())
        .and_then(|s| s.parse::<i64>().ok())
        .unwrap_or(modified_at);

    let created_at = rumor
        .tags
        .find(TagKind::custom("created_at"))
        .and_then(|t| t.content())
        .and_then(|s| s.parse::<i64>().ok())
        .unwrap_or(modified_at);

    let notebook_id: Option<String> = rumor
        .tags
        .find(TagKind::custom("notebook_id"))
        .and_then(|t| t.content())
        .map(std::string::ToString::to_string);

    let archived_at = rumor
        .tags
        .find(TagKind::custom("archived_at"))
        .and_then(|t| t.content())
        .and_then(|s| s.parse::<i64>().ok());

    let deleted_at = rumor
        .tags
        .find(TagKind::custom("deleted_at"))
        .and_then(|t| t.content())
        .and_then(|s| s.parse::<i64>().ok());

    let pinned_at = rumor
        .tags
        .find(TagKind::custom("pinned_at"))
        .and_then(|t| t.content())
        .and_then(|s| s.parse::<i64>().ok());

    let readonly = rumor
        .tags
        .find(TagKind::custom("readonly"))
        .and_then(|t| t.content())
        .is_some_and(|value| value == "true");

    let tags: Vec<String> = rumor
        .tags
        .filter(TagKind::t())
        .filter_map(|t: &Tag| t.content().map(std::string::ToString::to_string))
        .collect();

    // Reconstruct full markdown with title line
    let markdown = if title.is_empty() {
        rumor.content.clone()
    } else {
        format!("# {}\n\n{}", title, rumor.content)
    };

    Ok(SyncedNote {
        id: note_id,
        title,
        markdown,
        notebook_id,
        created_at,
        modified_at,
        edited_at,
        archived_at,
        deleted_at,
        pinned_at,
        readonly,
        tags,
    })
}

// ── Deletion tombstones ─────────────────────────────────────────────────

pub fn is_deleted_rumor(rumor: &UnsignedEvent) -> bool {
    rumor
        .tags
        .find(TagKind::custom("deleted"))
        .and_then(|t| t.content())
        == Some("true")
}

pub fn deleted_note_rumor(note_id: &str, pubkey: PublicKey) -> UnsignedEvent {
    let mut tags = comet_base_tags();
    tags.extend([
        Tag::identifier(note_id),
        Tag::custom(TagKind::custom("type"), vec!["note".to_string()]),
        Tag::custom(TagKind::custom("deleted"), vec!["true".to_string()]),
    ]);
    EventBuilder::new(COMET_EVENT_KIND, "")
        .tags(tags)
        .build(pubkey)
}

pub fn deleted_notebook_rumor(notebook_id: &str, pubkey: PublicKey) -> UnsignedEvent {
    let mut tags = comet_base_tags();
    tags.extend([
        Tag::identifier(notebook_id),
        Tag::custom(TagKind::custom("type"), vec!["notebook".to_string()]),
        Tag::custom(TagKind::custom("deleted"), vec!["true".to_string()]),
    ]);
    EventBuilder::new(COMET_EVENT_KIND, "")
        .tags(tags)
        .build(pubkey)
}

#[cfg(test)]
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

fn find_entity_type_tag(rumor: &UnsignedEvent) -> Option<&str> {
    rumor
        .tags
        .find(TagKind::custom("t"))
        .and_then(|t| t.content())
        .or_else(|| {
            rumor
                .tags
                .find(TagKind::custom("type"))
                .and_then(|t| t.content())
        })
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
        Tag::custom(TagKind::custom("t"), vec!["notebook".to_string()]),
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
    rumor.kind == COMET_EVENT_KIND && find_entity_type_tag(rumor) == Some("notebook")
}

// ── Note codec ──────────────────────────────────────────────────────────

#[cfg(test)]
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
        Tag::custom(TagKind::custom("t"), vec!["note".to_string()]),
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
        Tag::custom(TagKind::custom("t"), vec!["note".to_string()]),
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
        Tag::custom(TagKind::custom("t"), vec!["notebook".to_string()]),
        Tag::custom(TagKind::custom("deleted"), vec!["true".to_string()]),
    ]);
    EventBuilder::new(COMET_EVENT_KIND, "")
        .tags(tags)
        .build(pubkey)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_pubkey() -> PublicKey {
        Keys::generate().public_key()
    }

    // ── Note roundtrip ──────────────────────────────────────────────────

    #[test]
    fn note_roundtrip_preserves_all_fields() {
        let pubkey = test_pubkey();
        let note_id = "note-1234";
        let title = "Trail Report";
        let markdown = "# Trail Report\n\nSaw a bear.";
        let modified_at: i64 = 1_700_000_000_000;
        let edited_at: i64 = 1_700_000_001_000;
        let created_at: i64 = 1_699_999_000_000;
        let notebook_id = Some("notebook-42");
        let archived_at = Some(1_700_000_100_000_i64);
        let deleted_at = None;
        let pinned_at = Some(1_700_000_200_000_i64);
        let readonly = true;
        let tags = vec!["hiking".to_string(), "wildlife".to_string()];

        let rumor = note_to_rumor(
            note_id,
            title,
            markdown,
            modified_at,
            edited_at,
            created_at,
            notebook_id,
            archived_at,
            deleted_at,
            pinned_at,
            readonly,
            &tags,
            &[],
            pubkey,
        );

        let parsed = rumor_to_synced_note(&rumor).expect("parse should succeed");

        assert_eq!(parsed.id, note_id);
        assert_eq!(parsed.title, title);
        // Content is reconstructed with title prefix
        assert!(parsed.markdown.starts_with("# Trail Report"));
        assert!(parsed.markdown.contains("Saw a bear."));
        assert_eq!(parsed.modified_at, modified_at);
        assert_eq!(parsed.edited_at, edited_at);
        assert_eq!(parsed.created_at, created_at);
        assert_eq!(parsed.notebook_id.as_deref(), notebook_id);
        assert_eq!(parsed.archived_at, archived_at);
        assert_eq!(parsed.deleted_at, deleted_at);
        assert_eq!(parsed.pinned_at, pinned_at);
        assert!(parsed.readonly);
        assert_eq!(parsed.tags, tags);
    }

    #[test]
    fn note_roundtrip_minimal_fields() {
        let pubkey = test_pubkey();
        let rumor = note_to_rumor(
            "note-min",
            "",
            "",
            1_000,
            1_000,
            1_000,
            None,
            None,
            None,
            None,
            false,
            &[],
            &[],
            pubkey,
        );

        let parsed = rumor_to_synced_note(&rumor).expect("parse should succeed");
        assert_eq!(parsed.id, "note-min");
        assert_eq!(parsed.title, "");
        assert!(!parsed.readonly);
        assert!(parsed.notebook_id.is_none());
        assert!(parsed.archived_at.is_none());
        assert!(parsed.deleted_at.is_none());
        assert!(parsed.pinned_at.is_none());
        assert!(parsed.tags.is_empty());
    }

    // ── Notebook roundtrip ──────────────────────────────────────────────

    #[test]
    fn notebook_roundtrip_preserves_all_fields() {
        let pubkey = test_pubkey();
        let notebook_id = "notebook-99";
        let name = "Field Notes";
        let updated_at: i64 = 1_700_000_000_000;

        let rumor = notebook_to_rumor(notebook_id, name, updated_at, pubkey);
        let parsed = rumor_to_synced_notebook(&rumor).expect("parse should succeed");

        assert_eq!(parsed.id, notebook_id);
        assert_eq!(parsed.name, name);
        assert_eq!(parsed.updated_at, updated_at);
    }

    // ── is_notebook_rumor ───────────────────────────────────────────────

    #[test]
    fn is_notebook_rumor_true_for_notebooks() {
        let pubkey = test_pubkey();
        let rumor = notebook_to_rumor("nb-1", "Name", 1000, pubkey);
        assert!(is_notebook_rumor(&rumor));
    }

    #[test]
    fn is_notebook_rumor_false_for_notes() {
        let pubkey = test_pubkey();
        let rumor = note_to_rumor(
            "note-1",
            "Title",
            "# Title\n\nBody",
            1000,
            1000,
            1000,
            None,
            None,
            None,
            None,
            false,
            &[],
            &[],
            pubkey,
        );
        assert!(!is_notebook_rumor(&rumor));
    }

    // ── is_deleted_rumor ────────────────────────────────────────────────

    #[test]
    fn is_deleted_rumor_true_for_deletion_tombstones() {
        let pubkey = test_pubkey();
        let rumor = deleted_note_rumor("note-del", pubkey);
        assert!(is_deleted_rumor(&rumor));
    }

    #[test]
    fn is_deleted_rumor_false_for_normal_notes() {
        let pubkey = test_pubkey();
        let rumor = note_to_rumor(
            "note-1",
            "Title",
            "# Title",
            1000,
            1000,
            1000,
            None,
            None,
            None,
            None,
            false,
            &[],
            &[],
            pubkey,
        );
        assert!(!is_deleted_rumor(&rumor));
    }

    #[test]
    fn is_deleted_rumor_true_for_notebook_deletion() {
        let pubkey = test_pubkey();
        let rumor = deleted_notebook_rumor("nb-del", pubkey);
        assert!(is_deleted_rumor(&rumor));
    }

    // ── deleted_note_rumor ──────────────────────────────────────────────

    #[test]
    fn deleted_note_rumor_has_correct_d_tag() {
        let pubkey = test_pubkey();
        let rumor = deleted_note_rumor("note-xyz", pubkey);

        let d_tag = rumor
            .tags
            .find(TagKind::d())
            .and_then(|t| t.content())
            .map(str::to_string);
        assert_eq!(d_tag, Some("note-xyz".to_string()));
    }

    #[test]
    fn deleted_note_rumor_has_deleted_true_tag() {
        let pubkey = test_pubkey();
        let rumor = deleted_note_rumor("note-xyz", pubkey);

        let deleted_val = rumor
            .tags
            .find(TagKind::custom("deleted"))
            .and_then(|t| t.content())
            .map(str::to_string);
        assert_eq!(deleted_val, Some("true".to_string()));
    }

    #[test]
    fn deleted_note_rumor_has_note_type_tag() {
        let pubkey = test_pubkey();
        let rumor = deleted_note_rumor("note-xyz", pubkey);

        let type_val = rumor
            .tags
            .find(TagKind::custom("t"))
            .and_then(|t| t.content())
            .or_else(|| {
                rumor
                    .tags
                    .find(TagKind::custom("type"))
                    .and_then(|t| t.content())
            })
            .map(str::to_string);
        assert_eq!(type_val, Some("note".to_string()));
    }
}

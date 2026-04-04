use crate::domain::sync::model::SyncedNote;
use crate::error::AppError;
use nostr_sdk::prelude::*;

pub const COMET_EVENT_KIND: Kind = Kind::ApplicationSpecificData; // 30078
pub const COMET_SCHEMA_VERSION: &str = "1";
pub const COMET_CLIENT: &str = "comet";

#[cfg(test)]
fn split_markdown_title_prefix(markdown: &str, title: &str) -> String {
    if title.is_empty() {
        return markdown.to_string();
    }

    let Some(rest) = markdown.strip_prefix("# ") else {
        return markdown.to_string();
    };
    let Some(newline_index) = rest.find('\n') else {
        return String::new();
    };

    let line_title = rest[..newline_index].trim();
    if line_title != title {
        return markdown.to_string();
    }

    rest[newline_index..].to_string()
}

fn reconstruct_markdown_with_title(title: &str, content: &str) -> String {
    if title.is_empty() {
        return content.to_string();
    }

    if let Some(rest) = content.strip_prefix("# ") {
        let first_line = rest.lines().next().unwrap_or_default().trim();
        if first_line == title {
            return content.to_string();
        }
    }

    if content.is_empty() {
        return format!("# {title}");
    }

    if content.starts_with('\n') {
        return format!("# {title}{content}");
    }

    content.to_string()
}

pub fn comet_base_tags() -> Vec<Tag> {
    vec![
        Tag::custom(TagKind::custom("client"), vec![COMET_CLIENT.to_string()]),
        Tag::custom(TagKind::custom("v"), vec![COMET_SCHEMA_VERSION.to_string()]),
    ]
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
    archived_at: Option<i64>,
    deleted_at: Option<i64>,
    pinned_at: Option<i64>,
    readonly: bool,
    tags: &[String],
    blob_tags: &[(String, String, String)], // (plaintext_hash, ciphertext_hash, encryption_key_hex)
    pubkey: PublicKey,
) -> UnsignedEvent {
    let content = split_markdown_title_prefix(markdown, title);

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

    // Inner note payloads keep the plaintext attachment identity stable in
    // markdown, then carry the ciphertext locator and decryption key alongside
    // it so another device can fetch and decrypt the blob later.
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
    let markdown = reconstruct_markdown_with_title(&title, &rumor.content);

    Ok(SyncedNote {
        id: note_id,
        title,
        markdown,
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

// ── Deletion rumors ─────────────────────────────────────────────────────

pub fn deleted_note_rumor(note_id: &str, pubkey: PublicKey) -> UnsignedEvent {
    let mut tags = comet_base_tags();
    tags.extend([
        Tag::identifier(note_id),
        Tag::custom(TagKind::custom("type"), vec!["note".to_string()]),
    ]);
    EventBuilder::new(COMET_EVENT_KIND, "")
        .tags(tags)
        .build(pubkey)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::Deserialize;

    #[derive(Deserialize)]
    struct SharedEditorInvariantCorpus {
        cases: Vec<SharedEditorInvariantFixture>,
    }

    #[derive(Deserialize)]
    struct SharedEditorInvariantFixture {
        id: String,
        markdown: String,
        support: String,
        title: String,
    }

    fn shared_editor_invariant_fixtures() -> SharedEditorInvariantCorpus {
        serde_json::from_str(include_str!(
            "../../../../src/shared/lib/editor-invariant-fixtures.json"
        ))
        .unwrap()
    }

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
        assert_eq!(parsed.archived_at, archived_at);
        assert_eq!(parsed.deleted_at, deleted_at);
        assert_eq!(parsed.pinned_at, pinned_at);
        assert!(parsed.readonly);
        assert_eq!(parsed.tags, tags);
        assert_eq!(
            rumor
                .tags
                .find(TagKind::custom("type"))
                .and_then(|tag| tag.content()),
            Some("note")
        );
    }

    #[test]
    fn note_roundtrip_matches_lossless_shared_editor_invariant_fixtures() {
        let pubkey = test_pubkey();

        for fixture in shared_editor_invariant_fixtures()
            .cases
            .into_iter()
            .filter(|fixture| fixture.support == "lossless")
        {
            let rumor = note_to_rumor(
                &fixture.id,
                &fixture.title,
                &fixture.markdown,
                1_000,
                1_000,
                1_000,
                None,
                None,
                None,
                false,
                &[],
                &[],
                pubkey,
            );

            let parsed = rumor_to_synced_note(&rumor).expect("parse should succeed");
            assert_eq!(parsed.markdown, fixture.markdown, "fixture {}", fixture.id);
            assert_eq!(parsed.title, fixture.title, "fixture {}", fixture.id);
        }
    }

    #[test]
    fn note_roundtrip_preserves_exact_spacing_after_title() {
        let pubkey = test_pubkey();
        let markdown = "# Title\n![img](attachment://hash.png)";

        let rumor = note_to_rumor(
            "note-spacing",
            "Title",
            markdown,
            1_000,
            1_000,
            1_000,
            None,
            None,
            None,
            false,
            &[],
            &[],
            pubkey,
        );

        let parsed = rumor_to_synced_note(&rumor).expect("parse should succeed");
        assert_eq!(parsed.markdown, markdown);
    }

    #[test]
    fn note_roundtrip_preserves_body_only_markdown_when_title_tag_is_separate() {
        let pubkey = test_pubkey();
        let markdown = ["---", "**Advertisement :)**"].join("\n");

        let rumor = note_to_rumor(
            "note-body-only",
            "Title",
            &markdown,
            1_000,
            1_000,
            1_000,
            None,
            None,
            None,
            false,
            &[],
            &[],
            pubkey,
        );

        let parsed = rumor_to_synced_note(&rumor).expect("parse should succeed");
        assert_eq!(parsed.markdown, markdown);
    }

    #[test]
    fn note_roundtrip_preserves_title_only_markdown() {
        let pubkey = test_pubkey();
        let markdown = "# Title";

        let rumor = note_to_rumor(
            "note-title-only",
            "Title",
            markdown,
            1_000,
            1_000,
            1_000,
            None,
            None,
            None,
            false,
            &[],
            &[],
            pubkey,
        );

        let parsed = rumor_to_synced_note(&rumor).expect("parse should succeed");
        assert_eq!(parsed.markdown, markdown);
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
            false,
            &[],
            &[],
            pubkey,
        );

        let parsed = rumor_to_synced_note(&rumor).expect("parse should succeed");
        assert_eq!(parsed.id, "note-min");
        assert_eq!(parsed.title, "");
        assert!(!parsed.readonly);
        assert!(parsed.archived_at.is_none());
        assert!(parsed.deleted_at.is_none());
        assert!(parsed.pinned_at.is_none());
        assert!(parsed.tags.is_empty());
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
    fn deleted_note_rumor_does_not_include_deleted_tag() {
        let pubkey = test_pubkey();
        let rumor = deleted_note_rumor("note-xyz", pubkey);

        assert!(rumor.tags.find(TagKind::custom("deleted")).is_none());
    }

    #[test]
    fn deleted_note_rumor_has_note_type_tag() {
        let pubkey = test_pubkey();
        let rumor = deleted_note_rumor("note-xyz", pubkey);

        let type_val = rumor
            .tags
            .find(TagKind::custom("type"))
            .and_then(|t| t.content())
            .map(str::to_string);
        assert_eq!(type_val, Some("note".to_string()));
    }

    #[test]
    fn note_type_does_not_collide_with_comet_tags() {
        let pubkey = test_pubkey();
        let rumor = note_to_rumor(
            "note-tags",
            "Title",
            "# Title\n\nBody",
            1000,
            1000,
            1000,
            None,
            None,
            None,
            false,
            &["alpha".to_string(), "beta".to_string()],
            &[],
            pubkey,
        );

        let parsed = rumor_to_synced_note(&rumor).unwrap();

        assert_eq!(parsed.tags, vec!["alpha".to_string(), "beta".to_string()]);
        assert_eq!(
            rumor
                .tags
                .find(TagKind::custom("type"))
                .and_then(|tag| tag.content()),
            Some("note")
        );
        assert!(rumor.tags.find(TagKind::custom("t")).is_some());
    }
}

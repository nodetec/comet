use crate::domain::common::text::strip_title_line;
use crate::error::AppError;
use hmac::{Hmac, Mac};
use nostr_sdk::prelude::*;
use sha2::Sha256;

pub const REVISION_SYNC_EVENT_KIND: Kind = Kind::GiftWrap;
pub const REVISION_SYNC_SCHEMA_VERSION: &str = "2";
pub const REVISION_SYNC_STRATEGY: &str = "revision-sync.v1";

pub struct RevisionRumorInput<'a> {
    pub document_id: &'a str,
    pub title: &'a str,
    pub markdown: &'a str,
    pub created_at: i64,
    pub modified_at: i64,
    pub edited_at: i64,
    pub archived_at: Option<i64>,
    pub deleted_at: Option<i64>,
    pub pinned_at: Option<i64>,
    pub readonly: bool,
    pub tags: &'a [String],
    pub blob_tags: &'a [(String, String, String)],
    pub entity_type: &'a str,
    pub parent_revision_ids: &'a [String],
    pub op: &'a str,
}

pub struct RevisionEnvelopeMeta {
    pub recipient: String,
    pub document_coord: String,
    pub revision_id: String,
    pub parent_revision_ids: Vec<String>,
    pub op: String,
    pub mtime: i64,
    pub entity_type: Option<String>,
    pub schema_version: String,
}

fn find_entity_type_tag(event: &Event) -> Option<String> {
    event
        .tags
        .find(TagKind::custom("type"))
        .and_then(|tag| tag.content())
        .map(std::string::ToString::to_string)
}

pub fn parse_revision_envelope_meta(event: &Event) -> Result<RevisionEnvelopeMeta, AppError> {
    if event.kind != Kind::GiftWrap {
        return Err(AppError::custom("Expected kind 1059 gift wrap event"));
    }

    let recipient = event
        .tags
        .find(TagKind::p())
        .and_then(|tag| tag.content())
        .map(std::string::ToString::to_string)
        .ok_or_else(|| AppError::custom("Missing p tag in revision envelope"))?;

    let document_coord = event
        .tags
        .find(TagKind::d())
        .and_then(|tag| tag.content())
        .map(std::string::ToString::to_string)
        .ok_or_else(|| AppError::custom("Missing d tag in revision envelope"))?;

    let revision_id = event
        .tags
        .find(TagKind::custom("r"))
        .and_then(|tag| tag.content())
        .map(std::string::ToString::to_string)
        .ok_or_else(|| AppError::custom("Missing r tag in revision envelope"))?;

    let mtime = event
        .tags
        .find(TagKind::custom("m"))
        .and_then(|tag| tag.content())
        .and_then(|value| value.parse::<i64>().ok())
        .ok_or_else(|| AppError::custom("Missing or invalid m tag in revision envelope"))?;

    let op = event
        .tags
        .find(TagKind::custom("op"))
        .and_then(|tag| tag.content())
        .map(std::string::ToString::to_string)
        .ok_or_else(|| AppError::custom("Missing op tag in revision envelope"))?;

    let entity_type = find_entity_type_tag(event);

    let schema_version = event
        .tags
        .find(TagKind::custom("v"))
        .and_then(|tag| tag.content())
        .map(std::string::ToString::to_string)
        .unwrap_or_else(|| REVISION_SYNC_SCHEMA_VERSION.to_string());

    let parent_revision_ids = event
        .tags
        .filter(TagKind::custom("prev"))
        .filter_map(|tag| tag.content().map(std::string::ToString::to_string))
        .collect::<Vec<_>>();

    Ok(RevisionEnvelopeMeta {
        recipient,
        document_coord,
        revision_id,
        parent_revision_ids,
        op,
        mtime,
        entity_type,
        schema_version,
    })
}

pub fn revision_envelope_tags(meta: &RevisionEnvelopeMeta) -> Vec<Tag> {
    let mut tags = vec![
        Tag::public_key(
            PublicKey::parse(&meta.recipient).expect("recipient should be valid hex pubkey"),
        ),
        Tag::identifier(&meta.document_coord),
        Tag::custom(TagKind::custom("r"), vec![meta.revision_id.clone()]),
        Tag::custom(TagKind::custom("m"), vec![meta.mtime.to_string()]),
        Tag::custom(TagKind::custom("op"), vec![meta.op.clone()]),
        Tag::custom(TagKind::custom("v"), vec![meta.schema_version.clone()]),
    ];

    if let Some(entity_type) = &meta.entity_type {
        tags.push(Tag::custom(
            TagKind::custom("type"),
            vec![entity_type.clone()],
        ));
    }

    for parent in &meta.parent_revision_ids {
        tags.push(Tag::custom(TagKind::custom("prev"), vec![parent.clone()]));
    }

    tags
}

pub fn build_revision_note_rumor(
    input: RevisionRumorInput<'_>,
    pubkey: PublicKey,
) -> UnsignedEvent {
    let content = strip_title_line(input.markdown);

    let mut tags = vec![
        Tag::identifier(input.document_id),
        Tag::title(input.title),
        Tag::custom(TagKind::custom("type"), vec![input.entity_type.to_string()]),
        Tag::custom(
            TagKind::custom("modified_at"),
            vec![input.modified_at.to_string()],
        ),
        Tag::custom(
            TagKind::custom("edited_at"),
            vec![input.edited_at.to_string()],
        ),
        Tag::custom(
            TagKind::custom("created_at"),
            vec![input.created_at.to_string()],
        ),
        Tag::custom(TagKind::custom("op"), vec![input.op.to_string()]),
    ];

    if let Some(ts) = input.archived_at {
        tags.push(Tag::custom(
            TagKind::custom("archived_at"),
            vec![ts.to_string()],
        ));
    }

    if let Some(ts) = input.deleted_at {
        tags.push(Tag::custom(
            TagKind::custom("deleted_at"),
            vec![ts.to_string()],
        ));
    }

    if let Some(ts) = input.pinned_at {
        tags.push(Tag::custom(
            TagKind::custom("pinned_at"),
            vec![ts.to_string()],
        ));
    }

    if input.readonly {
        tags.push(Tag::custom(
            TagKind::custom("readonly"),
            vec!["true".to_string()],
        ));
    }

    for parent in input.parent_revision_ids {
        tags.push(Tag::custom(TagKind::custom("prev"), vec![parent.clone()]));
    }

    for tag in input.tags {
        tags.push(Tag::hashtag(tag));
    }

    // Preserve the plaintext attachment id used by markdown while carrying the
    // encrypted Blossom object id and decryption key in the sync payload.
    for (plaintext_hash, ciphertext_hash, key_hex) in input.blob_tags {
        tags.push(Tag::custom(
            TagKind::custom("blob"),
            vec![
                plaintext_hash.clone(),
                ciphertext_hash.clone(),
                key_hex.clone(),
            ],
        ));
    }

    EventBuilder::new(Kind::ApplicationSpecificData, content)
        .tags(tags)
        .build(pubkey)
}

pub fn compute_document_coord(secret_key: &SecretKey, document_id: &str) -> String {
    let mut mac = Hmac::<Sha256>::new_from_slice(secret_key.as_secret_bytes())
        .expect("HMAC accepts any key size");
    mac.update(document_id.as_bytes());
    hex::encode(mac.finalize().into_bytes())
}

pub fn compute_revision_id(
    secret_key: &SecretKey,
    canonical_payload: &str,
) -> Result<String, AppError> {
    let mut mac = Hmac::<Sha256>::new_from_slice(secret_key.as_secret_bytes())
        .map_err(|e| AppError::custom(format!("Failed to init revision HMAC: {e}")))?;
    mac.update(canonical_payload.as_bytes());
    Ok(hex::encode(mac.finalize().into_bytes()))
}

pub fn canonicalize_revision_payload(
    recipient: &str,
    document_coord: &str,
    parent_revision_ids: &[String],
    op: &str,
    entity_type: &str,
    title: &str,
    markdown: &str,
    created_at: i64,
    modified_at: i64,
    edited_at: i64,
    archived_at: Option<i64>,
    deleted_at: Option<i64>,
    pinned_at: Option<i64>,
    readonly: bool,
    tags: &[String],
) -> Result<String, AppError> {
    let mut sorted_parents = parent_revision_ids.to_vec();
    sorted_parents.sort();

    let mut sorted_tags = tags.to_vec();
    sorted_tags.sort();

    serde_json::to_string(&serde_json::json!({
        "strategy": REVISION_SYNC_STRATEGY,
        "recipient": recipient,
        "d": document_coord,
        "parents": sorted_parents,
        "op": op,
        "type": entity_type,
        "title": title,
        "markdown": markdown,
        "created_at": created_at,
        "modified_at": modified_at,
        "edited_at": edited_at,
        "archived_at": archived_at,
        "deleted_at": deleted_at,
        "pinned_at": pinned_at,
        "readonly": readonly,
        "tags": sorted_tags,
        "schema_version": REVISION_SYNC_SCHEMA_VERSION,
    }))
    .map_err(|e| AppError::custom(format!("Failed to canonicalize revision payload: {e}")))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn canonical_payload_is_stable_for_parent_order() {
        let payload_a = canonicalize_revision_payload(
            "recipient-1",
            "doc-1",
            &vec!["b".into(), "a".into()],
            "put",
            "note",
            "Title",
            "# Title\n\nBody",
            100,
            200,
            200,
            None,
            None,
            None,
            false,
            &vec!["z".into(), "a".into()],
        )
        .unwrap();

        let payload_b = canonicalize_revision_payload(
            "recipient-1",
            "doc-1",
            &vec!["a".into(), "b".into()],
            "put",
            "note",
            "Title",
            "# Title\n\nBody",
            100,
            200,
            200,
            None,
            None,
            None,
            false,
            &vec!["a".into(), "z".into()],
        )
        .unwrap();

        assert_eq!(payload_a, payload_b);
    }
}

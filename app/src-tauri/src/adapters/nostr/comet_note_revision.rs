#![allow(dead_code)]

use std::collections::{BTreeMap, BTreeSet};

use nostr_sdk::prelude::nip44::v2::ConversationKey;
use nostr_sdk::prelude::*;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::adapters::nostr::nip44_ext;
use crate::domain::common::text::{canonicalize_tag_path, title_from_markdown};
use crate::domain::sync::model::SyncedNote;
use crate::error::AppError;

pub const COMET_NOTE_REVISION_KIND: Kind = Kind::Custom(42061);
pub const COMET_NOTE_PAYLOAD_VERSION: u32 = 1;
pub const COMET_NOTE_COLLECTION: &str = "notes";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct NoteRevisionAttachment {
    pub plaintext_hash: String,
    pub ciphertext_hash: String,
    pub key: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct NoteRevisionPayload {
    pub version: u32,
    pub markdown: String,
    pub note_created_at: i64,
    pub edited_at: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub archived_at: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pinned_at: Option<i64>,
    #[serde(default, skip_serializing_if = "is_false")]
    pub readonly: bool,
    pub tags: Vec<String>,
    pub attachments: Vec<NoteRevisionAttachment>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NoteRevisionEventMeta {
    pub document_id: String,
    pub revision_id: String,
    pub parent_revision_ids: Vec<String>,
    pub operation: String,
    pub collection: Option<String>,
    pub created_at_ms: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParsedNoteRevisionEvent {
    pub document_id: String,
    pub revision_id: String,
    pub parent_revision_ids: Vec<String>,
    pub operation: String,
    pub collection: Option<String>,
    pub payload: Option<NoteRevisionPayload>,
}

fn is_false(value: &bool) -> bool {
    !value
}

fn self_conversation_key(keys: &Keys) -> Result<ConversationKey, AppError> {
    ConversationKey::derive(keys.secret_key(), &keys.public_key())
        .map_err(|e| AppError::custom(format!("Failed to derive self conversation key: {e}")))
}

fn canonical_parent_revision_ids(parent_revision_ids: &[String]) -> Vec<String> {
    let mut parents = parent_revision_ids.to_vec();
    parents.sort();
    parents.dedup();
    parents
}

impl NoteRevisionPayload {
    pub fn canonicalized(&self) -> Result<Self, AppError> {
        if self.version != COMET_NOTE_PAYLOAD_VERSION {
            return Err(AppError::custom(format!(
                "Unsupported Comet note payload version: {}",
                self.version
            )));
        }

        let mut seen_tags = BTreeSet::new();
        let mut tags = Vec::new();
        for tag in &self.tags {
            let canonical = canonicalize_tag_path(tag)
                .ok_or_else(|| AppError::custom(format!("Invalid note tag: {tag}")))?;
            if seen_tags.insert(canonical.clone()) {
                tags.push(canonical);
            }
        }
        tags.sort();

        let mut attachments_by_plaintext = BTreeMap::new();
        for attachment in &self.attachments {
            if attachment.plaintext_hash.is_empty()
                || attachment.ciphertext_hash.is_empty()
                || attachment.key.is_empty()
            {
                return Err(AppError::custom(
                    "Attachment fields must be non-empty in note revision payload",
                ));
            }

            match attachments_by_plaintext
                .insert(attachment.plaintext_hash.clone(), attachment.clone())
            {
                Some(existing) if existing != *attachment => {
                    return Err(AppError::custom(format!(
                        "Conflicting attachment metadata for plaintext hash: {}",
                        attachment.plaintext_hash
                    )));
                }
                _ => {}
            }
        }

        let attachments = attachments_by_plaintext.into_values().collect();

        Ok(Self {
            version: self.version,
            markdown: self.markdown.clone(),
            note_created_at: self.note_created_at,
            edited_at: self.edited_at,
            archived_at: self.archived_at,
            pinned_at: self.pinned_at,
            readonly: self.readonly,
            tags,
            attachments,
        })
    }

    pub fn to_canonical_json(&self) -> Result<String, AppError> {
        serde_json::to_string(&self.canonicalized()?)
            .map_err(|e| AppError::custom(format!("Failed to serialize note payload: {e}")))
    }

    pub fn from_canonical_json(json: &str) -> Result<Self, AppError> {
        let payload: Self = serde_json::from_str(json)
            .map_err(|e| AppError::custom(format!("Failed to parse note payload JSON: {e}")))?;
        payload.canonicalized()
    }
}

pub fn encrypt_note_revision_payload(
    keys: &Keys,
    payload: &NoteRevisionPayload,
) -> Result<String, AppError> {
    let conversation_key = self_conversation_key(keys)?;
    let json = payload.to_canonical_json()?;
    nip44_ext::encrypt(&conversation_key, json.as_bytes())
}

pub fn decrypt_note_revision_payload(
    keys: &Keys,
    content: &str,
) -> Result<NoteRevisionPayload, AppError> {
    let conversation_key = self_conversation_key(keys)?;
    let json_bytes = nip44_ext::decrypt(&conversation_key, content)?;
    let json = String::from_utf8(json_bytes)
        .map_err(|e| AppError::custom(format!("Encrypted note payload is not UTF-8: {e}")))?;
    NoteRevisionPayload::from_canonical_json(&json)
}

pub fn compute_note_revision_id(
    document_id: &str,
    parent_revision_ids: &[String],
    operation: &str,
    collection: Option<&str>,
    payload: Option<&NoteRevisionPayload>,
) -> Result<String, AppError> {
    if document_id.trim().is_empty() {
        return Err(AppError::custom(
            "Cannot compute note revision id without a document id",
        ));
    }

    if operation != "put" && operation != "del" {
        return Err(AppError::custom(format!(
            "Cannot compute note revision id for invalid operation: {operation}"
        )));
    }

    let payload_json = match payload {
        Some(payload) => Some(payload.to_canonical_json()?),
        None => None,
    };

    let material = serde_json::json!({
        "kind": COMET_NOTE_REVISION_KIND.as_u16(),
        "d": document_id,
        "r_parents": canonical_parent_revision_ids(parent_revision_ids),
        "o": operation,
        "c": collection,
        "payload": payload_json,
    });

    let canonical = serde_json::to_string(&material)
        .map_err(|e| AppError::custom(format!("Failed to serialize revision id material: {e}")))?;
    Ok(hex::encode(Sha256::digest(canonical.as_bytes())))
}

pub fn build_note_revision_tags(meta: &NoteRevisionEventMeta) -> Result<Vec<Tag>, AppError> {
    if meta.document_id.trim().is_empty() {
        return Err(AppError::custom("Missing d tag for note revision event"));
    }

    if meta.revision_id.trim().is_empty() {
        return Err(AppError::custom("Missing r tag for note revision event"));
    }

    if meta.operation != "put" && meta.operation != "del" {
        return Err(AppError::custom(format!(
            "Invalid note revision operation: {}",
            meta.operation
        )));
    }

    let mut tags = vec![
        Tag::identifier(&meta.document_id),
        Tag::custom(TagKind::custom("r"), vec![meta.revision_id.clone()]),
        Tag::custom(TagKind::custom("o"), vec![meta.operation.clone()]),
    ];

    for parent_revision_id in canonical_parent_revision_ids(&meta.parent_revision_ids) {
        if parent_revision_id.trim().is_empty() {
            return Err(AppError::custom(
                "Empty parent revision id in note revision event",
            ));
        }

        tags.push(Tag::custom(TagKind::custom("b"), vec![parent_revision_id]));
    }

    if let Some(collection) = &meta.collection {
        if collection.trim().is_empty() {
            return Err(AppError::custom(
                "Empty collection tag in note revision event",
            ));
        }

        tags.push(Tag::custom(TagKind::custom("c"), vec![collection.clone()]));
    }

    Ok(tags)
}

pub fn build_note_revision_event(
    keys: &Keys,
    meta: &NoteRevisionEventMeta,
    payload: Option<&NoteRevisionPayload>,
) -> Result<Event, AppError> {
    if meta.operation == "put" && payload.is_none() {
        return Err(AppError::custom(
            "Put note revision events must include an encrypted payload",
        ));
    }

    if meta.operation == "del" && payload.is_some() {
        return Err(AppError::custom(
            "Delete note revision events must not include a payload",
        ));
    }

    let content = match payload {
        Some(payload) => encrypt_note_revision_payload(keys, payload)?,
        None => String::new(),
    };

    let builder =
        EventBuilder::new(COMET_NOTE_REVISION_KIND, content).tags(build_note_revision_tags(meta)?);
    let builder = if let Some(created_at_ms) = meta.created_at_ms {
        let created_at_secs = u64::try_from(created_at_ms.div_euclid(1000)).map_err(|_| {
            AppError::custom(format!(
                "Invalid created_at_ms for revision event: {created_at_ms}"
            ))
        })?;
        builder.custom_created_at(Timestamp::from_secs(created_at_secs))
    } else {
        builder
    };

    builder
        .sign_with_keys(keys)
        .map_err(|e| AppError::custom(format!("Failed to sign note revision event: {e}")))
}

pub fn parse_note_revision_event(
    keys: &Keys,
    event: &Event,
) -> Result<ParsedNoteRevisionEvent, AppError> {
    if event.kind != COMET_NOTE_REVISION_KIND {
        return Err(AppError::custom(format!(
            "Expected note revision kind {}, got {}",
            COMET_NOTE_REVISION_KIND.as_u16(),
            event.kind.as_u16()
        )));
    }

    let document_id = event
        .tags
        .find(TagKind::d())
        .and_then(|tag| tag.content())
        .map(std::string::ToString::to_string)
        .ok_or_else(|| AppError::custom("Missing d tag in note revision event"))?;

    let revision_id = event
        .tags
        .find(TagKind::custom("r"))
        .and_then(|tag| tag.content())
        .map(std::string::ToString::to_string)
        .ok_or_else(|| AppError::custom("Missing r tag in note revision event"))?;

    let operation = event
        .tags
        .find(TagKind::custom("o"))
        .and_then(|tag| tag.content())
        .map(std::string::ToString::to_string)
        .ok_or_else(|| AppError::custom("Missing o tag in note revision event"))?;

    if operation != "put" && operation != "del" {
        return Err(AppError::custom(format!(
            "Invalid o tag in note revision event: {operation}"
        )));
    }

    let parent_revision_ids = canonical_parent_revision_ids(
        &event
            .tags
            .filter(TagKind::custom("b"))
            .filter_map(|tag| tag.content().map(std::string::ToString::to_string))
            .collect::<Vec<_>>(),
    );

    let collection = event
        .tags
        .find(TagKind::custom("c"))
        .and_then(|tag| tag.content())
        .map(std::string::ToString::to_string);

    let payload = if event.content.is_empty() {
        None
    } else {
        Some(decrypt_note_revision_payload(keys, &event.content)?)
    };

    if operation == "put" && payload.is_none() {
        return Err(AppError::custom(
            "Put note revision event is missing encrypted payload",
        ));
    }

    Ok(ParsedNoteRevisionEvent {
        document_id,
        revision_id,
        parent_revision_ids,
        operation,
        collection,
        payload,
    })
}

pub fn payload_to_synced_note(
    document_id: &str,
    revision_timestamp_ms: i64,
    payload: &NoteRevisionPayload,
) -> SyncedNote {
    SyncedNote {
        id: document_id.to_string(),
        title: title_from_markdown(&payload.markdown),
        markdown: payload.markdown.clone(),
        created_at: payload.note_created_at,
        modified_at: revision_timestamp_ms,
        edited_at: payload.edited_at,
        archived_at: payload.archived_at,
        deleted_at: None,
        pinned_at: payload.pinned_at,
        readonly: payload.readonly,
        tags: payload.tags.clone(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_payload() -> NoteRevisionPayload {
        NoteRevisionPayload {
            version: COMET_NOTE_PAYLOAD_VERSION,
            markdown: "# Title\n\nBody".to_string(),
            note_created_at: 100,
            edited_at: 200,
            archived_at: None,
            pinned_at: None,
            readonly: false,
            tags: vec![
                "Roadmap".into(),
                "work/project-alpha".into(),
                "roadmap".into(),
            ],
            attachments: vec![
                NoteRevisionAttachment {
                    plaintext_hash: "b".into(),
                    ciphertext_hash: "cipher-b".into(),
                    key: "key-b".into(),
                },
                NoteRevisionAttachment {
                    plaintext_hash: "a".into(),
                    ciphertext_hash: "cipher-a".into(),
                    key: "key-a".into(),
                },
            ],
        }
    }

    #[test]
    fn canonical_json_sorts_tags_and_attachments() {
        let json = sample_payload().to_canonical_json().unwrap();

        assert_eq!(
            json,
            "{\"version\":1,\"markdown\":\"# Title\\n\\nBody\",\"note_created_at\":100,\"edited_at\":200,\"tags\":[\"roadmap\",\"work/project-alpha\"],\"attachments\":[{\"plaintext_hash\":\"a\",\"ciphertext_hash\":\"cipher-a\",\"key\":\"key-a\"},{\"plaintext_hash\":\"b\",\"ciphertext_hash\":\"cipher-b\",\"key\":\"key-b\"}]}"
        );
    }

    #[test]
    fn canonical_json_omits_absent_optional_fields() {
        let json = sample_payload().to_canonical_json().unwrap();

        assert!(!json.contains("archived_at"));
        assert!(!json.contains("pinned_at"));
        assert!(!json.contains("readonly"));
    }

    #[test]
    fn payload_encryption_round_trips() {
        let keys = Keys::generate();
        let payload = sample_payload();

        let encrypted = encrypt_note_revision_payload(&keys, &payload).unwrap();
        let decrypted = decrypt_note_revision_payload(&keys, &encrypted).unwrap();

        assert_eq!(decrypted, payload.canonicalized().unwrap());
    }

    #[test]
    fn compute_revision_id_is_stable_for_parent_order() {
        let payload = sample_payload();
        let a = compute_note_revision_id(
            "B181093E-A1A3-492F-BF55-6E661BFEA397",
            &["b".into(), "a".into()],
            "put",
            Some(COMET_NOTE_COLLECTION),
            Some(&payload),
        )
        .unwrap();
        let b = compute_note_revision_id(
            "B181093E-A1A3-492F-BF55-6E661BFEA397",
            &["a".into(), "b".into()],
            "put",
            Some(COMET_NOTE_COLLECTION),
            Some(&payload),
        )
        .unwrap();

        assert_eq!(a, b);
    }

    #[test]
    fn build_and_parse_put_note_revision_event_round_trip() {
        let keys = Keys::generate();
        let payload = sample_payload();
        let revision_id = compute_note_revision_id(
            "B181093E-A1A3-492F-BF55-6E661BFEA397",
            &["parent-2".into(), "parent-1".into()],
            "put",
            Some(COMET_NOTE_COLLECTION),
            Some(&payload),
        )
        .unwrap();
        let meta = NoteRevisionEventMeta {
            document_id: "B181093E-A1A3-492F-BF55-6E661BFEA397".to_string(),
            revision_id: revision_id.clone(),
            parent_revision_ids: vec!["parent-2".into(), "parent-1".into()],
            operation: "put".to_string(),
            collection: Some(COMET_NOTE_COLLECTION.to_string()),
            created_at_ms: Some(2000),
        };

        let event = build_note_revision_event(&keys, &meta, Some(&payload)).unwrap();
        let parsed = parse_note_revision_event(&keys, &event).unwrap();

        assert_eq!(event.kind, COMET_NOTE_REVISION_KIND);
        assert_eq!(parsed.document_id, meta.document_id);
        assert_eq!(parsed.revision_id, revision_id);
        assert_eq!(
            parsed.parent_revision_ids,
            vec!["parent-1".to_string(), "parent-2".to_string()]
        );
        assert_eq!(parsed.operation, "put");
        assert_eq!(parsed.collection.as_deref(), Some(COMET_NOTE_COLLECTION));
        assert_eq!(parsed.payload.unwrap(), payload.canonicalized().unwrap());
        assert_eq!(
            event
                .tags
                .find(TagKind::custom("r"))
                .and_then(|tag| tag.content()),
            Some(revision_id.as_str())
        );
    }

    #[test]
    fn build_and_parse_delete_note_revision_event_round_trip() {
        let keys = Keys::generate();
        let revision_id = compute_note_revision_id(
            "B181093E-A1A3-492F-BF55-6E661BFEA397",
            &["parent-1".into()],
            "del",
            Some(COMET_NOTE_COLLECTION),
            None,
        )
        .unwrap();
        let meta = NoteRevisionEventMeta {
            document_id: "B181093E-A1A3-492F-BF55-6E661BFEA397".to_string(),
            revision_id,
            parent_revision_ids: vec!["parent-1".into()],
            operation: "del".to_string(),
            collection: Some(COMET_NOTE_COLLECTION.to_string()),
            created_at_ms: Some(3000),
        };

        let event = build_note_revision_event(&keys, &meta, None).unwrap();
        let parsed = parse_note_revision_event(&keys, &event).unwrap();

        assert_eq!(parsed.operation, "del");
        assert!(parsed.payload.is_none());
        assert!(event.content.is_empty());
    }
}

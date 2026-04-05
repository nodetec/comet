#![allow(dead_code)]

use std::collections::{BTreeMap, BTreeSet};

use nostr_sdk::prelude::nip44::v2::ConversationKey;
use nostr_sdk::prelude::*;
use serde::{Deserialize, Serialize};

use crate::adapters::nostr::nip44_ext;
use crate::domain::common::text::{canonicalize_tag_path, title_from_markdown};
use crate::domain::sync::model::{SyncedNote, SyncedTombstone};
use crate::domain::sync::vector_clock::{canonicalize_vector_clock, VectorClock};
use crate::error::AppError;

pub const COMET_NOTE_SNAPSHOT_KIND: Kind = Kind::Custom(42061);
pub const COMET_NOTE_SNAPSHOT_VERSION: u32 = 1;
pub const COMET_NOTE_COLLECTION: &str = "notes";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct NoteSnapshotAttachment {
    pub plaintext_hash: String,
    pub ciphertext_hash: String,
    pub key: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct NoteSnapshotPayload {
    pub version: u32,
    pub device_id: String,
    #[serde(skip, default)]
    pub vector_clock: VectorClock,
    pub markdown: String,
    pub note_created_at: i64,
    pub edited_at: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deleted_at: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub archived_at: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pinned_at: Option<i64>,
    #[serde(default, skip_serializing_if = "is_false")]
    pub readonly: bool,
    pub tags: Vec<String>,
    pub attachments: Vec<NoteSnapshotAttachment>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NoteSnapshotEventMeta {
    pub document_id: String,
    pub operation: String,
    pub collection: Option<String>,
    pub created_at_ms: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParsedNoteSnapshotEvent {
    pub document_id: String,
    pub operation: String,
    pub collection: Option<String>,
    pub payload: Option<NoteSnapshotPayload>,
}

fn is_false(value: &bool) -> bool {
    !value
}

fn self_conversation_key(keys: &Keys) -> Result<ConversationKey, AppError> {
    ConversationKey::derive(keys.secret_key(), &keys.public_key())
        .map_err(|e| AppError::custom(format!("Failed to derive self conversation key: {e}")))
}

impl NoteSnapshotPayload {
    pub fn canonicalized(&self) -> Result<Self, AppError> {
        if self.version != COMET_NOTE_SNAPSHOT_VERSION {
            return Err(AppError::custom(format!(
                "Unsupported Comet note payload version: {}",
                self.version
            )));
        }

        if self.device_id.trim().is_empty() {
            return Err(AppError::custom("Note payload device_id must be non-empty"));
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
                    "Attachment fields must be non-empty in note snapshot payload",
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
            device_id: self.device_id.clone(),
            vector_clock: canonicalize_vector_clock(&self.vector_clock).unwrap_or_default(),
            markdown: self.markdown.clone(),
            note_created_at: self.note_created_at,
            edited_at: self.edited_at,
            deleted_at: self.deleted_at,
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

pub fn encrypt_note_snapshot_payload(
    keys: &Keys,
    payload: &NoteSnapshotPayload,
) -> Result<String, AppError> {
    let conversation_key = self_conversation_key(keys)?;
    let json = payload.to_canonical_json()?;
    nip44_ext::encrypt(&conversation_key, json.as_bytes())
}

pub fn decrypt_note_snapshot_payload(
    keys: &Keys,
    content: &str,
) -> Result<NoteSnapshotPayload, AppError> {
    let conversation_key = self_conversation_key(keys)?;
    let json_bytes = nip44_ext::decrypt(&conversation_key, content)?;
    let json = String::from_utf8(json_bytes)
        .map_err(|e| AppError::custom(format!("Encrypted note payload is not UTF-8: {e}")))?;
    NoteSnapshotPayload::from_canonical_json(&json)
}

fn build_visible_vector_clock_tags(payload: &NoteSnapshotPayload) -> Result<Vec<Tag>, AppError> {
    let vector_clock =
        canonicalize_vector_clock(&payload.vector_clock).map_err(AppError::custom)?;
    if vector_clock.is_empty() {
        return Err(AppError::custom(
            "Note snapshot payload vector_clock must be non-empty",
        ));
    }

    Ok(vector_clock
        .into_iter()
        .map(|(device_id, counter)| {
            Tag::custom(TagKind::custom("vc"), vec![device_id, counter.to_string()])
        })
        .collect())
}

fn parse_visible_vector_clock_tags(event: &Event) -> Result<VectorClock, AppError> {
    let mut vector_clock = BTreeMap::new();

    for tag in event
        .tags
        .iter()
        .filter(|tag| tag.kind() == TagKind::custom("vc"))
    {
        let values = tag.as_slice();
        let device_id = values
            .get(1)
            .cloned()
            .ok_or_else(|| AppError::custom("Snapshot vc tag must include a device id"))?;
        let counter_text = values
            .get(2)
            .cloned()
            .ok_or_else(|| AppError::custom("Snapshot vc tag must include a counter"))?;

        if device_id.trim().is_empty() {
            return Err(AppError::custom(
                "Snapshot vc tag device id must be non-empty",
            ));
        }

        let counter = counter_text.parse::<u64>().map_err(|_| {
            AppError::custom(format!(
                "Snapshot vc tag counter must be an unsigned integer: {counter_text}"
            ))
        })?;

        if vector_clock.insert(device_id.clone(), counter).is_some() {
            return Err(AppError::custom(format!(
                "Duplicate snapshot vc tag for device id: {device_id}"
            )));
        }
    }

    if vector_clock.is_empty() {
        return Err(AppError::custom(
            "Missing visible vector clock tags in note snapshot event",
        ));
    }

    canonicalize_vector_clock(&vector_clock).map_err(AppError::custom)
}

pub fn build_note_snapshot_tags(
    meta: &NoteSnapshotEventMeta,
    payload: &NoteSnapshotPayload,
) -> Result<Vec<Tag>, AppError> {
    if meta.document_id.trim().is_empty() {
        return Err(AppError::custom("Missing d tag in note snapshot event"));
    }

    if meta.operation != "put" && meta.operation != "del" {
        return Err(AppError::custom(format!(
            "Invalid note snapshot operation: {}",
            meta.operation
        )));
    }

    let mut tags = vec![
        Tag::identifier(&meta.document_id),
        Tag::custom(TagKind::custom("o"), vec![meta.operation.clone()]),
    ];
    tags.extend(build_visible_vector_clock_tags(payload)?);

    if let Some(collection) = &meta.collection {
        if collection.trim().is_empty() {
            return Err(AppError::custom(
                "Empty collection tag in note snapshot event",
            ));
        }

        tags.push(Tag::custom(TagKind::custom("c"), vec![collection.clone()]));
    }

    Ok(tags)
}

pub fn build_note_snapshot_event(
    keys: &Keys,
    meta: &NoteSnapshotEventMeta,
    payload: Option<&NoteSnapshotPayload>,
) -> Result<Event, AppError> {
    if payload.is_none() {
        return Err(AppError::custom(
            "Note snapshot events must include an encrypted payload",
        ));
    }

    let payload = payload.expect("payload presence validated above");
    if meta.operation == "put" && payload.deleted_at.is_some() {
        return Err(AppError::custom(
            "Put note snapshot payloads must not include deleted_at",
        ));
    }
    if meta.operation == "del" && payload.deleted_at.is_none() {
        return Err(AppError::custom(
            "Delete note snapshot payloads must include deleted_at",
        ));
    }

    let content = encrypt_note_snapshot_payload(keys, payload)?;

    let builder = EventBuilder::new(COMET_NOTE_SNAPSHOT_KIND, content)
        .tags(build_note_snapshot_tags(meta, payload)?);
    let builder = if let Some(created_at_ms) = meta.created_at_ms {
        let created_at_secs = u64::try_from(created_at_ms.div_euclid(1000)).map_err(|_| {
            AppError::custom(format!(
                "Invalid created_at_ms for snapshot event: {created_at_ms}"
            ))
        })?;
        builder.custom_created_at(Timestamp::from_secs(created_at_secs))
    } else {
        builder
    };

    builder
        .sign_with_keys(keys)
        .map_err(|e| AppError::custom(format!("Failed to sign note snapshot event: {e}")))
}

pub fn parse_note_snapshot_event(
    keys: &Keys,
    event: &Event,
) -> Result<ParsedNoteSnapshotEvent, AppError> {
    if event.kind != COMET_NOTE_SNAPSHOT_KIND {
        return Err(AppError::custom(format!(
            "Expected note snapshot kind {}, got {}",
            COMET_NOTE_SNAPSHOT_KIND.as_u16(),
            event.kind.as_u16()
        )));
    }

    let document_id = event
        .tags
        .find(TagKind::d())
        .and_then(|tag| tag.content())
        .map(std::string::ToString::to_string)
        .ok_or_else(|| AppError::custom("Missing d tag in note snapshot event"))?;

    let operation = event
        .tags
        .find(TagKind::custom("o"))
        .and_then(|tag| tag.content())
        .map(std::string::ToString::to_string)
        .ok_or_else(|| AppError::custom("Missing o tag in note snapshot event"))?;

    if operation != "put" && operation != "del" {
        return Err(AppError::custom(format!(
            "Invalid o tag in note snapshot event: {operation}"
        )));
    }

    let collection = event
        .tags
        .find(TagKind::custom("c"))
        .and_then(|tag| tag.content())
        .map(std::string::ToString::to_string);

    let payload = if event.content.is_empty() {
        None
    } else {
        Some(decrypt_note_snapshot_payload(keys, &event.content)?)
    };

    if payload.is_none() {
        return Err(AppError::custom(
            "Note snapshot event is missing encrypted payload",
        ));
    }

    let mut payload = payload.expect("payload presence validated above");
    payload.vector_clock = parse_visible_vector_clock_tags(event)?;
    if operation == "put" && payload.deleted_at.is_some() {
        return Err(AppError::custom(
            "Put note snapshot payloads must not include deleted_at",
        ));
    }
    if operation == "del" && payload.deleted_at.is_none() {
        return Err(AppError::custom(
            "Delete note snapshot payloads must include deleted_at",
        ));
    }

    Ok(ParsedNoteSnapshotEvent {
        document_id,
        operation,
        collection,
        payload: Some(payload),
    })
}

pub fn payload_to_synced_note(
    document_id: &str,
    snapshot_timestamp_ms: i64,
    payload: &NoteSnapshotPayload,
) -> SyncedNote {
    SyncedNote {
        id: document_id.to_string(),
        device_id: payload.device_id.clone(),
        vector_clock: payload.vector_clock.clone(),
        title: title_from_markdown(&payload.markdown),
        markdown: payload.markdown.clone(),
        created_at: payload.note_created_at,
        modified_at: snapshot_timestamp_ms,
        edited_at: payload.edited_at,
        archived_at: payload.archived_at,
        deleted_at: None,
        pinned_at: payload.pinned_at,
        readonly: payload.readonly,
        tags: payload.tags.clone(),
    }
}

pub fn payload_to_synced_tombstone(
    document_id: &str,
    payload: &NoteSnapshotPayload,
) -> Result<SyncedTombstone, AppError> {
    let deleted_at = payload
        .deleted_at
        .ok_or_else(|| AppError::custom("Delete note snapshot payload is missing deleted_at"))?;

    Ok(SyncedTombstone {
        id: document_id.to_string(),
        device_id: payload.device_id.clone(),
        vector_clock: payload.vector_clock.clone(),
        deleted_at,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_payload() -> NoteSnapshotPayload {
        NoteSnapshotPayload {
            version: COMET_NOTE_SNAPSHOT_VERSION,
            device_id: "DEVICE-A".to_string(),
            vector_clock: BTreeMap::from([("DEVICE-A".to_string(), 2)]),
            markdown: "# Title\n\nBody".to_string(),
            note_created_at: 100,
            edited_at: 200,
            deleted_at: None,
            archived_at: None,
            pinned_at: None,
            readonly: false,
            tags: vec![
                "Roadmap".into(),
                "work/project-alpha".into(),
                "roadmap".into(),
            ],
            attachments: vec![
                NoteSnapshotAttachment {
                    plaintext_hash: "b".into(),
                    ciphertext_hash: "cipher-b".into(),
                    key: "key-b".into(),
                },
                NoteSnapshotAttachment {
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
            "{\"version\":1,\"device_id\":\"DEVICE-A\",\"markdown\":\"# Title\\n\\nBody\",\"note_created_at\":100,\"edited_at\":200,\"tags\":[\"roadmap\",\"work/project-alpha\"],\"attachments\":[{\"plaintext_hash\":\"a\",\"ciphertext_hash\":\"cipher-a\",\"key\":\"key-a\"},{\"plaintext_hash\":\"b\",\"ciphertext_hash\":\"cipher-b\",\"key\":\"key-b\"}]}"
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

        let encrypted = encrypt_note_snapshot_payload(&keys, &payload).unwrap();
        let decrypted = decrypt_note_snapshot_payload(&keys, &encrypted).unwrap();

        let mut expected = payload.canonicalized().unwrap();
        expected.vector_clock.clear();
        assert_eq!(decrypted, expected);
    }

    #[test]
    fn build_and_parse_put_note_snapshot_event_round_trip() {
        let keys = Keys::generate();
        let payload = sample_payload();
        let meta = NoteSnapshotEventMeta {
            document_id: "B181093E-A1A3-492F-BF55-6E661BFEA397".to_string(),
            operation: "put".to_string(),
            collection: Some(COMET_NOTE_COLLECTION.to_string()),
            created_at_ms: Some(2000),
        };

        let event = build_note_snapshot_event(&keys, &meta, Some(&payload)).unwrap();
        let parsed = parse_note_snapshot_event(&keys, &event).unwrap();

        assert_eq!(event.kind, COMET_NOTE_SNAPSHOT_KIND);
        assert_eq!(
            event
                .tags
                .iter()
                .filter(|tag| tag.kind() == TagKind::custom("vc"))
                .count(),
            1
        );
        assert_eq!(parsed.document_id, meta.document_id);
        assert_eq!(parsed.operation, "put");
        assert_eq!(parsed.collection.as_deref(), Some(COMET_NOTE_COLLECTION));
        assert_eq!(parsed.payload.unwrap(), payload.canonicalized().unwrap());
    }

    #[test]
    fn build_and_parse_delete_note_snapshot_event_round_trip() {
        let keys = Keys::generate();
        let payload = NoteSnapshotPayload {
            version: COMET_NOTE_SNAPSHOT_VERSION,
            device_id: "DEVICE-A".to_string(),
            vector_clock: BTreeMap::from([("DEVICE-A".to_string(), 3)]),
            markdown: String::new(),
            note_created_at: 0,
            edited_at: 300,
            deleted_at: Some(300),
            archived_at: None,
            pinned_at: None,
            readonly: false,
            tags: vec![],
            attachments: vec![],
        };
        let meta = NoteSnapshotEventMeta {
            document_id: "B181093E-A1A3-492F-BF55-6E661BFEA397".to_string(),
            operation: "del".to_string(),
            collection: Some(COMET_NOTE_COLLECTION.to_string()),
            created_at_ms: Some(3000),
        };

        let event = build_note_snapshot_event(&keys, &meta, Some(&payload)).unwrap();
        let parsed = parse_note_snapshot_event(&keys, &event).unwrap();

        assert_eq!(parsed.operation, "del");
        assert_eq!(parsed.payload.unwrap(), payload.canonicalized().unwrap());
        assert!(!event.content.is_empty());
    }

    #[test]
    fn parse_uses_visible_vector_clock_as_source_of_truth() {
        let keys = Keys::generate();
        let payload = sample_payload();
        let meta = NoteSnapshotEventMeta {
            document_id: "B181093E-A1A3-492F-BF55-6E661BFEA397".to_string(),
            operation: "put".to_string(),
            collection: Some(COMET_NOTE_COLLECTION.to_string()),
            created_at_ms: Some(2000),
        };

        let event = build_note_snapshot_event(&keys, &meta, Some(&payload)).unwrap();
        let mut tags = event.tags.to_vec();
        tags.retain(|tag| tag.kind() != TagKind::custom("vc"));
        tags.push(Tag::custom(
            TagKind::custom("vc"),
            vec!["DEVICE-A".to_string(), "999".to_string()],
        ));

        let tampered = EventBuilder::new(event.kind, event.content.clone())
            .tags(tags)
            .custom_created_at(event.created_at)
            .sign_with_keys(&keys)
            .unwrap();

        let parsed = parse_note_snapshot_event(&keys, &tampered).unwrap();
        assert_eq!(
            parsed.payload.unwrap().vector_clock,
            BTreeMap::from([("DEVICE-A".to_string(), 999)])
        );
    }
}

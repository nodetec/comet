use std::collections::BTreeMap;

use nostr_sdk::prelude::*;
use serde::{Deserialize, Serialize};

use crate::adapters::nostr::comet_note_snapshot::{
    build_visible_vector_clock_tags, is_false, parse_visible_vector_clock_tags,
    self_conversation_key, NoteSnapshotEventMeta, COMET_NOTE_SNAPSHOT_KIND,
};
use crate::adapters::nostr::nip44_ext;
use crate::domain::sync::vector_clock::{canonicalize_vector_clock, VectorClock};
use crate::error::AppError;

pub const COMET_TAG_METADATA_COLLECTION: &str = "tag_metadata";
pub const COMET_TAG_METADATA_D_TAG: &str = "tag_metadata";
pub const COMET_TAG_METADATA_SNAPSHOT_VERSION: u32 = 1;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TagMetadataEntry {
    #[serde(default, skip_serializing_if = "is_false")]
    pub pinned: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
}

impl TagMetadataEntry {
    pub fn is_default(&self) -> bool {
        !self.pinned && self.icon.is_none()
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TagMetadataSnapshotPayload {
    pub version: u32,
    pub device_id: String,
    #[serde(skip, default)]
    pub vector_clock: VectorClock,
    pub tags: BTreeMap<String, TagMetadataEntry>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParsedTagMetadataSnapshotEvent {
    pub document_id: String,
    pub operation: String,
    pub collection: Option<String>,
    pub payload: TagMetadataSnapshotPayload,
}

impl TagMetadataSnapshotPayload {
    pub fn canonicalized(&self) -> Result<Self, AppError> {
        if self.version != COMET_TAG_METADATA_SNAPSHOT_VERSION {
            return Err(AppError::custom(format!(
                "Unsupported tag metadata payload version: {}",
                self.version
            )));
        }

        if self.device_id.trim().is_empty() {
            return Err(AppError::custom(
                "Tag metadata payload device_id must be non-empty",
            ));
        }

        let tags: BTreeMap<String, TagMetadataEntry> = self
            .tags
            .iter()
            .filter(|(_, entry)| !entry.is_default())
            .map(|(path, entry)| {
                let canonical_entry = TagMetadataEntry {
                    pinned: entry.pinned,
                    icon: entry
                        .icon
                        .as_ref()
                        .filter(|icon| !icon.trim().is_empty())
                        .cloned(),
                };
                (path.clone(), canonical_entry)
            })
            .filter(|(_, entry)| !entry.is_default())
            .collect();

        Ok(Self {
            version: self.version,
            device_id: self.device_id.clone(),
            vector_clock: canonicalize_vector_clock(&self.vector_clock).unwrap_or_default(),
            tags,
        })
    }

    pub fn to_canonical_json(&self) -> Result<String, AppError> {
        serde_json::to_string(&self.canonicalized()?).map_err(|e| {
            AppError::custom(format!("Failed to serialize tag metadata payload: {e}"))
        })
    }

    pub fn from_canonical_json(json: &str) -> Result<Self, AppError> {
        let payload: Self = serde_json::from_str(json).map_err(|e| {
            AppError::custom(format!("Failed to parse tag metadata payload JSON: {e}"))
        })?;
        payload.canonicalized()
    }
}

pub fn encrypt_tag_metadata_payload(
    keys: &Keys,
    payload: &TagMetadataSnapshotPayload,
) -> Result<String, AppError> {
    let conversation_key = self_conversation_key(keys)?;
    let json = payload.to_canonical_json()?;
    nip44_ext::encrypt(&conversation_key, json.as_bytes())
}

pub fn decrypt_tag_metadata_payload(
    keys: &Keys,
    content: &str,
) -> Result<TagMetadataSnapshotPayload, AppError> {
    let conversation_key = self_conversation_key(keys)?;
    let json_bytes = nip44_ext::decrypt(&conversation_key, content)?;
    let json = String::from_utf8(json_bytes).map_err(|e| {
        AppError::custom(format!(
            "Encrypted tag metadata payload is not UTF-8: {e}"
        ))
    })?;
    TagMetadataSnapshotPayload::from_canonical_json(&json)
}

pub fn build_tag_metadata_snapshot_event(
    keys: &Keys,
    meta: &NoteSnapshotEventMeta,
    payload: &TagMetadataSnapshotPayload,
) -> Result<Event, AppError> {
    let content = encrypt_tag_metadata_payload(keys, payload)?;

    let mut tags = vec![
        Tag::identifier(&meta.document_id),
        Tag::custom(TagKind::custom("o"), vec![meta.operation.clone()]),
    ];
    tags.extend(build_visible_vector_clock_tags(&payload.vector_clock)?);

    if let Some(collection) = &meta.collection {
        if collection.trim().is_empty() {
            return Err(AppError::custom(
                "Empty collection tag in tag metadata snapshot event",
            ));
        }
        tags.push(Tag::custom(TagKind::custom("c"), vec![collection.clone()]));
    }

    let builder = EventBuilder::new(COMET_NOTE_SNAPSHOT_KIND, content).tags(tags);
    let builder = if let Some(created_at_ms) = meta.created_at_ms {
        let created_at_secs = u64::try_from(created_at_ms.div_euclid(1000)).map_err(|_| {
            AppError::custom(format!(
                "Invalid created_at_ms for tag metadata snapshot event: {created_at_ms}"
            ))
        })?;
        builder.custom_created_at(Timestamp::from_secs(created_at_secs))
    } else {
        builder
    };

    builder.sign_with_keys(keys).map_err(|e| {
        AppError::custom(format!(
            "Failed to sign tag metadata snapshot event: {e}"
        ))
    })
}

pub fn parse_tag_metadata_snapshot_event(
    keys: &Keys,
    event: &Event,
) -> Result<ParsedTagMetadataSnapshotEvent, AppError> {
    if event.kind != COMET_NOTE_SNAPSHOT_KIND {
        return Err(AppError::custom(format!(
            "Expected snapshot kind {}, got {}",
            COMET_NOTE_SNAPSHOT_KIND.as_u16(),
            event.kind.as_u16()
        )));
    }

    let document_id = event
        .tags
        .find(TagKind::d())
        .and_then(|tag| tag.content())
        .map(std::string::ToString::to_string)
        .ok_or_else(|| AppError::custom("Missing d tag in tag metadata snapshot event"))?;

    let operation = event
        .tags
        .find(TagKind::custom("o"))
        .and_then(|tag| tag.content())
        .map(std::string::ToString::to_string)
        .ok_or_else(|| AppError::custom("Missing o tag in tag metadata snapshot event"))?;

    let collection = event
        .tags
        .find(TagKind::custom("c"))
        .and_then(|tag| tag.content())
        .map(std::string::ToString::to_string);

    if event.content.is_empty() {
        return Err(AppError::custom(
            "Tag metadata snapshot event is missing encrypted payload",
        ));
    }

    let mut payload = decrypt_tag_metadata_payload(keys, &event.content)?;
    payload.vector_clock = parse_visible_vector_clock_tags(event)?;

    Ok(ParsedTagMetadataSnapshotEvent {
        document_id,
        operation,
        collection,
        payload,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_payload() -> TagMetadataSnapshotPayload {
        TagMetadataSnapshotPayload {
            version: COMET_TAG_METADATA_SNAPSHOT_VERSION,
            device_id: "DEVICE-A".to_string(),
            vector_clock: BTreeMap::from([("DEVICE-A".to_string(), 2)]),
            tags: BTreeMap::from([
                (
                    "recipes".to_string(),
                    TagMetadataEntry {
                        pinned: true,
                        icon: Some("utensils".to_string()),
                    },
                ),
                (
                    "work".to_string(),
                    TagMetadataEntry {
                        pinned: true,
                        icon: None,
                    },
                ),
            ]),
        }
    }

    fn sample_meta() -> NoteSnapshotEventMeta {
        NoteSnapshotEventMeta {
            document_id: COMET_TAG_METADATA_D_TAG.to_string(),
            operation: "put".to_string(),
            collection: Some(COMET_TAG_METADATA_COLLECTION.to_string()),
            created_at_ms: Some(2000),
        }
    }

    #[test]
    fn canonical_json_sorts_tags_by_path() {
        let json = sample_payload().to_canonical_json().unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();
        let keys: Vec<&str> = parsed["tags"].as_object().unwrap().keys().map(|k| k.as_str()).collect();
        assert_eq!(keys, vec!["recipes", "work"]);
    }

    #[test]
    fn canonical_json_omits_default_entries() {
        let mut payload = sample_payload();
        payload.tags.insert(
            "default-tag".to_string(),
            TagMetadataEntry {
                pinned: false,
                icon: None,
            },
        );
        let json = payload.to_canonical_json().unwrap();
        assert!(!json.contains("default-tag"));
    }

    #[test]
    fn canonical_json_omits_false_pinned() {
        let payload = TagMetadataSnapshotPayload {
            version: COMET_TAG_METADATA_SNAPSHOT_VERSION,
            device_id: "DEVICE-A".to_string(),
            vector_clock: BTreeMap::from([("DEVICE-A".to_string(), 1)]),
            tags: BTreeMap::from([(
                "tag-with-icon".to_string(),
                TagMetadataEntry {
                    pinned: false,
                    icon: Some("star".to_string()),
                },
            )]),
        };
        let json = payload.to_canonical_json().unwrap();
        assert!(!json.contains("pinned"));
        assert!(json.contains("star"));
    }

    #[test]
    fn payload_encryption_round_trips() {
        let keys = Keys::generate();
        let payload = sample_payload();

        let encrypted = encrypt_tag_metadata_payload(&keys, &payload).unwrap();
        let decrypted = decrypt_tag_metadata_payload(&keys, &encrypted).unwrap();

        let mut expected = payload.canonicalized().unwrap();
        expected.vector_clock.clear();
        assert_eq!(decrypted, expected);
    }

    #[test]
    fn build_and_parse_round_trip() {
        let keys = Keys::generate();
        let payload = sample_payload();
        let meta = sample_meta();

        let event = build_tag_metadata_snapshot_event(&keys, &meta, &payload).unwrap();
        let parsed = parse_tag_metadata_snapshot_event(&keys, &event).unwrap();

        assert_eq!(event.kind, COMET_NOTE_SNAPSHOT_KIND);
        assert_eq!(parsed.document_id, COMET_TAG_METADATA_D_TAG);
        assert_eq!(parsed.operation, "put");
        assert_eq!(
            parsed.collection.as_deref(),
            Some(COMET_TAG_METADATA_COLLECTION)
        );
        assert_eq!(parsed.payload, payload.canonicalized().unwrap());
    }

    #[test]
    fn rejects_empty_device_id() {
        let payload = TagMetadataSnapshotPayload {
            version: COMET_TAG_METADATA_SNAPSHOT_VERSION,
            device_id: String::new(),
            vector_clock: BTreeMap::from([("DEVICE-A".to_string(), 1)]),
            tags: BTreeMap::new(),
        };
        let err = payload.canonicalized().unwrap_err();
        assert!(err
            .to_string()
            .contains("device_id must be non-empty"));
    }

    #[test]
    fn rejects_unsupported_version() {
        let payload = TagMetadataSnapshotPayload {
            version: 99,
            device_id: "DEVICE-A".to_string(),
            vector_clock: BTreeMap::from([("DEVICE-A".to_string(), 1)]),
            tags: BTreeMap::new(),
        };
        let err = payload.canonicalized().unwrap_err();
        assert!(err.to_string().contains("Unsupported tag metadata payload version"));
    }

    #[test]
    fn strips_whitespace_only_icon() {
        let payload = TagMetadataSnapshotPayload {
            version: COMET_TAG_METADATA_SNAPSHOT_VERSION,
            device_id: "DEVICE-A".to_string(),
            vector_clock: BTreeMap::from([("DEVICE-A".to_string(), 1)]),
            tags: BTreeMap::from([(
                "tag".to_string(),
                TagMetadataEntry {
                    pinned: true,
                    icon: Some("  ".to_string()),
                },
            )]),
        };
        let canonical = payload.canonicalized().unwrap();
        assert_eq!(canonical.tags["tag"].icon, None);
    }
}

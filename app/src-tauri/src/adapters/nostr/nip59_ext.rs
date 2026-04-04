//! Gift wrap/unwrap helpers built on the local large-payload NIP-44 shim.
//!
//! Replaces `EventBuilder::gift_wrap()` and `nip59::extract_rumor()` to support
//! payloads larger than the standard NIP-44 v2 limit of ~64KB.

use nostr_sdk::prelude::nip44::v2::ConversationKey;
use nostr_sdk::prelude::nip59::RANGE_RANDOM_TIMESTAMP_TWEAK;
use nostr_sdk::prelude::*;

use crate::adapters::nostr::nip44_ext;
use crate::error::AppError;

/// Unwrapped gift wrap result.
pub struct UnwrappedGift {
    pub rumor: UnsignedEvent,
}

/// Gift-wrap a rumor to a receiver using the local large-payload NIP-44 shim.
///
/// Steps:
/// 1. Serialize rumor as JSON
/// 2. Build kind 13 seal encrypted with `nip44_ext`, signed by `keys`
/// 3. Build kind 1059 gift wrap encrypted with `nip44_ext` using ephemeral key
pub fn gift_wrap<I>(
    keys: &Keys,
    receiver: &PublicKey,
    mut rumor: UnsignedEvent,
    extra_tags: I,
) -> Result<Event, AppError>
where
    I: IntoIterator<Item = Tag>,
{
    // Ensure rumor has an event ID
    rumor.ensure_id();
    let rumor_json = rumor.as_json();

    // ── Seal (kind 13) ──────────────────────────────────────────────────
    let seal_conv_key = ConversationKey::derive(keys.secret_key(), receiver)
        .map_err(|e| AppError::custom(format!("Failed to derive seal conversation key: {e}")))?;
    let encrypted_rumor = nip44_ext::encrypt(&seal_conv_key, rumor_json.as_bytes())?;

    let seal = EventBuilder::new(Kind::Seal, encrypted_rumor)
        .custom_created_at(Timestamp::tweaked(RANGE_RANDOM_TIMESTAMP_TWEAK))
        .sign_with_keys(keys)
        .map_err(|e| AppError::custom(format!("Failed to sign seal: {e}")))?;

    // ── Gift Wrap (kind 1059) ───────────────────────────────────────────
    let ephemeral_keys = Keys::generate();
    let wrap_conv_key = ConversationKey::derive(ephemeral_keys.secret_key(), receiver)
        .map_err(|e| AppError::custom(format!("Failed to derive wrap conversation key: {e}")))?;
    let encrypted_seal = nip44_ext::encrypt(&wrap_conv_key, seal.as_json().as_bytes())?;

    let mut tags: Vec<Tag> = extra_tags.into_iter().collect();
    tags.push(Tag::public_key(*receiver));

    let gift_wrap = EventBuilder::new(Kind::GiftWrap, encrypted_seal)
        .tags(tags)
        .custom_created_at(Timestamp::tweaked(RANGE_RANDOM_TIMESTAMP_TWEAK))
        .sign_with_keys(&ephemeral_keys)
        .map_err(|e| AppError::custom(format!("Failed to sign gift wrap: {e}")))?;

    Ok(gift_wrap)
}

/// Extract a rumor from a gift-wrapped event using the local large-payload NIP-44 shim.
///
/// Handles both standard and extended prefix payloads for backward compatibility.
pub fn extract_rumor(keys: &Keys, gift_wrap: &Event) -> Result<UnwrappedGift, AppError> {
    if gift_wrap.kind != Kind::GiftWrap {
        return Err(AppError::custom("Not a Gift Wrap event"));
    }

    // ── Decrypt gift wrap → seal ────────────────────────────────────────
    let wrap_conv_key = ConversationKey::derive(keys.secret_key(), &gift_wrap.pubkey)
        .map_err(|e| AppError::custom(format!("Failed to derive wrap conversation key: {e}")))?;
    let seal_json_bytes = nip44_ext::decrypt(&wrap_conv_key, &gift_wrap.content)?;
    let seal_json = String::from_utf8(seal_json_bytes)
        .map_err(|e| AppError::custom(format!("Seal is not valid UTF-8: {e}")))?;
    let seal = Event::from_json(&seal_json)
        .map_err(|e| AppError::custom(format!("Invalid seal event: {e}")))?;
    seal.verify()
        .map_err(|e| AppError::custom(format!("Seal signature invalid: {e}")))?;

    // ── Decrypt seal → rumor ────────────────────────────────────────────
    let seal_conv_key = ConversationKey::derive(keys.secret_key(), &seal.pubkey)
        .map_err(|e| AppError::custom(format!("Failed to derive seal conversation key: {e}")))?;
    let rumor_json_bytes = nip44_ext::decrypt(&seal_conv_key, &seal.content)?;
    let rumor_json = String::from_utf8(rumor_json_bytes)
        .map_err(|e| AppError::custom(format!("Rumor is not valid UTF-8: {e}")))?;
    let rumor = UnsignedEvent::from_json(&rumor_json)
        .map_err(|e| AppError::custom(format!("Invalid rumor event: {e}")))?;

    // Verify sender matches
    if rumor.pubkey != seal.pubkey {
        return Err(AppError::custom("Sender public key mismatch"));
    }

    Ok(UnwrappedGift { rumor })
}

//! NIP-44 v2 with extended length prefix.
//!
//! Identical to standard NIP-44 v2 except for the padding format:
//! - Small payloads (< 65536 bytes): u16 BE prefix (standard, fully compatible)
//! - Large payloads (>= 65536 bytes): `[0x00, 0x00]` + u32 BE prefix
//!
//! Based on <https://github.com/nostr-protocol/nips/pull/2270>.

use base64::engine::{general_purpose, Engine};
use chacha20::cipher::{KeyIvInit, StreamCipher};
use chacha20::ChaCha20;
use nostr_sdk::prelude::hashes::hmac::{Hmac, HmacEngine};
use nostr_sdk::prelude::hashes::sha256::Hash as Sha256Hash;
use nostr_sdk::prelude::hashes::{Hash, HashEngine};
use nostr_sdk::prelude::nip44::v2::ConversationKey;
use subtle::ConstantTimeEq;

use crate::error::AppError;

const MESSAGE_KEYS_SIZE: usize = 76;
const EXTENDED_PREFIX_THRESHOLD: usize = 65536;

// ── Message Keys ────────────────────────────────────────────────────────

struct MessageKeys([u8; MESSAGE_KEYS_SIZE]);

impl MessageKeys {
    fn encryption(&self) -> &[u8] {
        &self.0[0..32]
    }

    fn nonce(&self) -> &[u8] {
        &self.0[32..44]
    }

    fn auth(&self) -> &[u8] {
        &self.0[44..76]
    }
}

fn get_message_keys(
    conversation_key: &ConversationKey,
    nonce: &[u8],
) -> Result<MessageKeys, AppError> {
    let expanded =
        nostr_sdk::prelude::hkdf::expand(conversation_key.as_bytes(), nonce, MESSAGE_KEYS_SIZE);
    let arr: [u8; MESSAGE_KEYS_SIZE] = expanded
        .try_into()
        .map_err(|_| AppError::custom("HKDF expand returned wrong length"))?;
    Ok(MessageKeys(arr))
}

// ── Padding ─────────────────────────────────────────────────────────────

fn calc_padding(len: usize) -> usize {
    if len <= 32 {
        return 32;
    }
    let nextpower = 1usize << (log2_floor(len - 1) + 1);
    let chunk = if nextpower <= 256 { 32 } else { nextpower / 8 };
    chunk * (((len - 1) / chunk) + 1)
}

fn log2_floor(x: usize) -> u32 {
    if x == 0 {
        0
    } else {
        (usize::BITS - 1) - x.leading_zeros()
    }
}

fn pad(plaintext: &[u8]) -> Result<Vec<u8>, AppError> {
    let len = plaintext.len();
    if len == 0 {
        return Err(AppError::custom("NIP-44: plaintext is empty"));
    }

    let padded_len = calc_padding(len);
    let pad_zeros = padded_len - len;

    if len < EXTENDED_PREFIX_THRESHOLD {
        // Standard u16 prefix
        let mut buf = Vec::with_capacity(2 + len + pad_zeros);
        buf.extend_from_slice(&(len as u16).to_be_bytes());
        buf.extend_from_slice(plaintext);
        buf.resize(buf.len() + pad_zeros, 0);
        Ok(buf)
    } else {
        // Extended: 0x0000 sentinel + u32 prefix
        let mut buf = Vec::with_capacity(6 + len + pad_zeros);
        buf.extend_from_slice(&[0x00, 0x00]);
        buf.extend_from_slice(&(len as u32).to_be_bytes());
        buf.extend_from_slice(plaintext);
        buf.resize(buf.len() + pad_zeros, 0);
        Ok(buf)
    }
}

/// Validate padding and return (`prefix_len`, `plaintext_len`) so the caller
/// can truncate the buffer in-place without an extra allocation.
fn unpad_params(padded: &[u8]) -> Result<(usize, usize), AppError> {
    if padded.len() < 2 {
        return Err(AppError::custom("NIP-44: padded data too short"));
    }

    let first_two = u16::from_be_bytes([padded[0], padded[1]]);
    let (prefix_len, unpadded_len) = if first_two == 0 {
        // Extended format
        if padded.len() < 6 {
            return Err(AppError::custom(
                "NIP-44: padded data too short for extended prefix",
            ));
        }
        let len = u32::from_be_bytes([padded[2], padded[3], padded[4], padded[5]]) as usize;
        if len < EXTENDED_PREFIX_THRESHOLD {
            return Err(AppError::custom("NIP-44: non-canonical extended prefix"));
        }
        (6, len)
    } else {
        (2, first_two as usize)
    };

    if unpadded_len == 0 {
        return Err(AppError::custom("NIP-44: message empty"));
    }

    if padded.len() < prefix_len + unpadded_len {
        return Err(AppError::custom("NIP-44: invalid padding (too short)"));
    }

    let expected_total = prefix_len + calc_padding(unpadded_len);
    if padded.len() != expected_total {
        return Err(AppError::custom(
            "NIP-44: invalid padding (wrong total length)",
        ));
    }

    Ok((prefix_len, unpadded_len))
}

// ── Encrypt / Decrypt ───────────────────────────────────────────────────

/// Encrypt plaintext using NIP-44 v2 with extended prefix support.
/// Returns base64-encoded payload.
pub fn encrypt(conversation_key: &ConversationKey, plaintext: &[u8]) -> Result<String, AppError> {
    // Generate random nonce
    let mut nonce = [0u8; 32];
    getrandom::fill(&mut nonce).map_err(|e| AppError::custom(format!("RNG failure: {e}")))?;

    let keys = get_message_keys(conversation_key, &nonce)?;

    // Pad
    let mut buffer = pad(plaintext)?;

    // Encrypt with ChaCha20
    let mut cipher = ChaCha20::new(keys.encryption().into(), keys.nonce().into());
    cipher.apply_keystream(&mut buffer);

    // HMAC-SHA256
    let mut engine: HmacEngine<Sha256Hash> = HmacEngine::new(keys.auth());
    engine.input(&nonce);
    engine.input(&buffer);
    let hmac: [u8; 32] = Hmac::from_engine(engine).to_byte_array();

    // Compose payload: version + nonce + ciphertext + hmac
    let mut payload = Vec::with_capacity(1 + 32 + buffer.len() + 32);
    payload.push(0x02); // Version byte
    payload.extend_from_slice(&nonce);
    payload.extend_from_slice(&buffer);
    payload.extend_from_slice(&hmac);

    Ok(general_purpose::STANDARD.encode(payload))
}

/// Decrypt a base64-encoded NIP-44 v2 payload with extended prefix support.
/// Handles both standard u16 and extended u32 length prefixes.
pub fn decrypt(
    conversation_key: &ConversationKey,
    base64_payload: &str,
) -> Result<Vec<u8>, AppError> {
    let payload = general_purpose::STANDARD
        .decode(base64_payload)
        .map_err(|e| AppError::custom(format!("NIP-44: base64 decode failed: {e}")))?;

    decrypt_bytes(conversation_key, &payload)
}

/// Decrypt raw bytes (already base64-decoded).
fn decrypt_bytes(conversation_key: &ConversationKey, payload: &[u8]) -> Result<Vec<u8>, AppError> {
    let len = payload.len();
    if len < 99 {
        return Err(AppError::custom("NIP-44: payload too short"));
    }

    // Check version
    if payload[0] != 0x02 {
        return Err(AppError::custom(format!(
            "NIP-44: unknown version {}",
            payload[0]
        )));
    }

    let nonce = &payload[1..33];
    let buffer = &payload[33..len - 32];
    let mac = &payload[len - 32..];

    let keys = get_message_keys(conversation_key, nonce)?;

    // Verify HMAC before decryption
    let mut engine: HmacEngine<Sha256Hash> = HmacEngine::new(keys.auth());
    engine.input(nonce);
    engine.input(buffer);
    let calculated_mac: [u8; 32] = Hmac::from_engine(engine).to_byte_array();
    if mac.ct_eq(&calculated_mac).unwrap_u8() != 1 {
        return Err(AppError::custom("NIP-44: invalid HMAC"));
    }

    // Decrypt with ChaCha20
    let mut buffer = buffer.to_vec();
    let mut cipher = ChaCha20::new(keys.encryption().into(), keys.nonce().into());
    cipher.apply_keystream(&mut buffer);

    // Unpad in-place (avoids an extra allocation)
    let (prefix_len, plaintext_len) = unpad_params(&buffer)?;
    buffer.drain(..prefix_len);
    buffer.truncate(plaintext_len);
    Ok(buffer)
}

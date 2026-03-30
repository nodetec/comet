use crate::error::AppError;
use sha2::{Digest, Sha256};
use std::cmp::Ordering;
use std::collections::BTreeSet;

const PROTOCOL_VERSION: u8 = 0x61;
const ID_SIZE: usize = 32;
const FINGERPRINT_SIZE: usize = 16;
const BUCKETS: usize = 16;
const DOUBLE_BUCKETS: usize = BUCKETS * 2;
const MAX_TIMESTAMP: u64 = u64::MAX;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RevisionNegentropyItem {
    pub revision_id: String,
    pub mtime: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RevisionNegentropyOutput {
    pub next_message_hex: Option<String>,
    pub have: Vec<String>,
    pub need: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
struct Item {
    timestamp: u64,
    id: [u8; ID_SIZE],
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct Bound {
    timestamp: u64,
    id: [u8; ID_SIZE],
    id_len: usize,
}

impl Bound {
    fn new() -> Self {
        Self {
            timestamp: 0,
            id: [0; ID_SIZE],
            id_len: 0,
        }
    }

    fn from_item(item: &Item) -> Self {
        Self {
            timestamp: item.timestamp,
            id: item.id,
            id_len: ID_SIZE,
        }
    }

    fn with_timestamp(timestamp: u64) -> Self {
        Self {
            timestamp,
            id: [0; ID_SIZE],
            id_len: 0,
        }
    }

    fn with_timestamp_and_id(timestamp: u64, id: &[u8]) -> Result<Self, AppError> {
        if id.len() > ID_SIZE {
            return Err(AppError::custom("Negentropy bound ID too large"));
        }

        let mut out = Self::new();
        out.timestamp = timestamp;
        out.id[..id.len()].copy_from_slice(id);
        out.id_len = id.len();
        Ok(out)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Mode {
    Skip = 0,
    Fingerprint = 1,
    IdList = 2,
}

impl Mode {
    fn from_u64(value: u64) -> Result<Self, AppError> {
        match value {
            0 => Ok(Self::Skip),
            1 => Ok(Self::Fingerprint),
            2 => Ok(Self::IdList),
            _ => Err(AppError::custom(format!(
                "Unexpected negentropy mode: {value}"
            ))),
        }
    }
}

pub struct RevisionNegentropySession {
    items: Vec<Item>,
    frame_size_limit: u64,
    is_initiator: bool,
    last_timestamp_in: u64,
    last_timestamp_out: u64,
}

impl RevisionNegentropySession {
    pub fn new(items: &[RevisionNegentropyItem], frame_size_limit: u64) -> Result<Self, AppError> {
        if frame_size_limit != 0 && frame_size_limit < 4096 {
            return Err(AppError::custom(
                "Negentropy frame size limit must be 0 or >= 4096",
            ));
        }

        let mut storage = Vec::with_capacity(items.len());
        for item in items {
            storage.push(Item {
                timestamp: item.mtime,
                id: decode_revision_id(&item.revision_id)?,
            });
        }
        storage.sort();
        storage.dedup();

        Ok(Self {
            items: storage,
            frame_size_limit,
            is_initiator: false,
            last_timestamp_in: 0,
            last_timestamp_out: 0,
        })
    }

    pub fn initiate_hex(&mut self) -> Result<String, AppError> {
        if self.is_initiator {
            return Err(AppError::custom("Negentropy session already initiated"));
        }

        self.is_initiator = true;

        let mut output = vec![PROTOCOL_VERSION];
        output.extend(self.split_range(0, self.items.len(), Bound::with_timestamp(MAX_TIMESTAMP))?);
        Ok(hex::encode(output))
    }

    pub fn reconcile_with_ids_hex(
        &mut self,
        message_hex: &str,
    ) -> Result<RevisionNegentropyOutput, AppError> {
        if !self.is_initiator {
            return Err(AppError::custom("Negentropy client session not initiated"));
        }

        let bytes = hex::decode(message_hex)
            .map_err(|e| AppError::custom(format!("Invalid negentropy message hex: {e}")))?;

        let mut have = Vec::new();
        let mut need = Vec::new();
        let next = self.reconcile_inner(&bytes, &mut have, &mut need)?;

        Ok(RevisionNegentropyOutput {
            next_message_hex: if next.len() == 1 {
                None
            } else {
                Some(hex::encode(next))
            },
            have: have.into_iter().map(hex::encode).collect(),
            need: need.into_iter().map(hex::encode).collect(),
        })
    }

    #[cfg(test)]
    pub fn reconcile_hex(&mut self, message_hex: &str) -> Result<String, AppError> {
        if self.is_initiator {
            return Err(AppError::custom(
                "Responder reconcile called on initiator session",
            ));
        }

        let bytes = hex::decode(message_hex)
            .map_err(|e| AppError::custom(format!("Invalid negentropy message hex: {e}")))?;
        Ok(hex::encode(
            self.reconcile_inner(&bytes, &mut Vec::new(), &mut Vec::new())?,
        ))
    }

    fn reconcile_inner(
        &mut self,
        query: &[u8],
        have: &mut Vec<[u8; ID_SIZE]>,
        need: &mut Vec<[u8; ID_SIZE]>,
    ) -> Result<Vec<u8>, AppError> {
        self.last_timestamp_in = 0;
        self.last_timestamp_out = 0;

        let mut query = query;
        let mut full_output = vec![PROTOCOL_VERSION];

        let protocol_version = get_byte(&mut query)?;
        if !(0x60..=0x6f).contains(&protocol_version) {
            return Err(AppError::custom("Invalid negentropy protocol version byte"));
        }

        if protocol_version != PROTOCOL_VERSION {
            if self.is_initiator {
                return Err(AppError::custom(format!(
                    "Unsupported negentropy protocol version: {}",
                    protocol_version - 0x60
                )));
            }
            return Ok(full_output);
        }

        let storage_size = self.items.len();
        let mut prev_bound = Bound::new();
        let mut prev_index = 0usize;
        let mut skip = false;

        while !query.is_empty() {
            let mut output = Vec::new();
            let curr_bound = self.decode_bound(&mut query)?;
            let mode = Mode::from_u64(decode_var_int(&mut query)?)?;

            let lower = prev_index;
            let mut upper = self.find_lower_bound(prev_index, storage_size, &curr_bound);

            match mode {
                Mode::Skip => {
                    skip = true;
                }
                Mode::Fingerprint => {
                    let their_fingerprint = get_byte_array::<FINGERPRINT_SIZE>(&mut query)?;
                    let our_fingerprint = self.fingerprint(lower, upper)?;

                    if their_fingerprint != our_fingerprint {
                        if skip {
                            skip = false;
                            output.extend(self.encode_bound(&prev_bound));
                            output.extend(encode_var_int(Mode::Skip as u64));
                        }
                        output.extend(self.split_range(lower, upper, curr_bound)?);
                    } else {
                        skip = true;
                    }
                }
                Mode::IdList => {
                    let num_ids = decode_var_int(&mut query)? as usize;
                    let mut their_elems = BTreeSet::new();
                    for _ in 0..num_ids {
                        their_elems.insert(get_byte_array::<ID_SIZE>(&mut query)?);
                    }

                    if self.is_initiator {
                        skip = true;

                        for item in &self.items[lower..upper] {
                            if !their_elems.remove(&item.id) {
                                have.push(item.id);
                            }
                        }

                        need.extend(their_elems);
                    } else {
                        if skip {
                            skip = false;
                            output.extend(self.encode_bound(&prev_bound));
                            output.extend(encode_var_int(Mode::Skip as u64));
                        }

                        let mut response_ids = Vec::new();
                        let mut num_response_ids = 0usize;
                        let mut end_bound = curr_bound;

                        for (index, item) in self.items[lower..upper].iter().enumerate() {
                            if self.exceeded_frame_size_limit(
                                full_output.len() + response_ids.len(),
                            ) {
                                end_bound = Bound::from_item(item);
                                upper = lower + index;
                                break;
                            }

                            response_ids.extend_from_slice(&item.id);
                            num_response_ids += 1;
                        }

                        output.extend(self.encode_bound(&end_bound));
                        output.extend(encode_var_int(Mode::IdList as u64));
                        output.extend(encode_var_int(num_response_ids as u64));
                        output.extend(response_ids);

                        full_output.extend(&output);
                        output.clear();
                    }
                }
            }

            if self.exceeded_frame_size_limit(full_output.len() + output.len()) {
                let remaining_fingerprint = self.fingerprint(upper, storage_size)?;
                full_output.extend(self.encode_bound(&Bound::with_timestamp(MAX_TIMESTAMP)));
                full_output.extend(encode_var_int(Mode::Fingerprint as u64));
                full_output.extend_from_slice(&remaining_fingerprint);
                break;
            }

            full_output.extend(output);
            prev_index = upper;
            prev_bound = curr_bound;
        }

        Ok(full_output)
    }

    fn split_range(
        &mut self,
        lower: usize,
        upper: usize,
        upper_bound: Bound,
    ) -> Result<Vec<u8>, AppError> {
        let num_elems = upper - lower;
        let mut output = Vec::new();

        if num_elems < DOUBLE_BUCKETS {
            output.extend(self.encode_bound(&upper_bound));
            output.extend(encode_var_int(Mode::IdList as u64));
            output.extend(encode_var_int(num_elems as u64));

            for item in &self.items[lower..upper] {
                output.extend_from_slice(&item.id);
            }
            return Ok(output);
        }

        let items_per_bucket = num_elems / BUCKETS;
        let buckets_with_extra = num_elems % BUCKETS;
        let mut curr = lower;

        for i in 0..BUCKETS {
            let bucket_size = items_per_bucket + usize::from(i < buckets_with_extra);
            let our_fingerprint = self.fingerprint(curr, curr + bucket_size)?;
            curr += bucket_size;

            let next_bound = if curr == upper {
                upper_bound
            } else {
                self.get_minimal_bound(&self.items[curr - 1], &self.items[curr])?
            };

            output.extend(self.encode_bound(&next_bound));
            output.extend(encode_var_int(Mode::Fingerprint as u64));
            output.extend_from_slice(&our_fingerprint);
        }

        Ok(output)
    }

    fn fingerprint(&self, begin: usize, end: usize) -> Result<[u8; FINGERPRINT_SIZE], AppError> {
        let mut accumulator = [0u8; ID_SIZE];

        for item in &self.items[begin..end] {
            add_id(&mut accumulator, &item.id);
        }

        let mut input = Vec::with_capacity(ID_SIZE + 10);
        input.extend_from_slice(&accumulator);
        input.extend(encode_var_int((end - begin) as u64));

        let digest = Sha256::digest(&input);
        let mut fingerprint = [0u8; FINGERPRINT_SIZE];
        fingerprint.copy_from_slice(&digest[..FINGERPRINT_SIZE]);
        Ok(fingerprint)
    }

    fn find_lower_bound(&self, mut first: usize, last: usize, value: &Bound) -> usize {
        let mut count = last - first;

        while count > 0 {
            let mut it = first;
            let step = count / 2;
            it += step;

            if item_cmp_bound(&self.items[it], value).is_lt() {
                it += 1;
                first = it;
                count -= step + 1;
            } else {
                count = step;
            }
        }

        first
    }

    fn exceeded_frame_size_limit(&self, length: usize) -> bool {
        self.frame_size_limit != 0 && length > self.frame_size_limit as usize - 200
    }

    fn decode_bound(&mut self, encoded: &mut &[u8]) -> Result<Bound, AppError> {
        let timestamp = self.decode_timestamp_in(encoded)?;
        let id_len = decode_var_int(encoded)? as usize;
        let id_bytes = get_bytes(encoded, id_len)?;
        Bound::with_timestamp_and_id(timestamp, id_bytes)
    }

    fn decode_timestamp_in(&mut self, encoded: &mut &[u8]) -> Result<u64, AppError> {
        let raw = decode_var_int(encoded)?;
        let timestamp = if raw == 0 { MAX_TIMESTAMP } else { raw - 1 };

        if self.last_timestamp_in == MAX_TIMESTAMP || timestamp == MAX_TIMESTAMP {
            self.last_timestamp_in = MAX_TIMESTAMP;
            return Ok(MAX_TIMESTAMP);
        }

        let timestamp = timestamp.saturating_add(self.last_timestamp_in);
        self.last_timestamp_in = timestamp;
        Ok(timestamp)
    }

    fn encode_bound(&mut self, bound: &Bound) -> Vec<u8> {
        let mut output = Vec::new();
        output.extend(self.encode_timestamp_out(bound.timestamp));
        output.extend(encode_var_int(bound.id_len as u64));
        output.extend_from_slice(&bound.id[..bound.id_len]);
        output
    }

    fn encode_timestamp_out(&mut self, timestamp: u64) -> Vec<u8> {
        if timestamp == MAX_TIMESTAMP {
            self.last_timestamp_out = MAX_TIMESTAMP;
            return encode_var_int(0);
        }

        let previous = self.last_timestamp_out;
        self.last_timestamp_out = timestamp;
        encode_var_int(timestamp.saturating_sub(previous).saturating_add(1))
    }

    fn get_minimal_bound(&self, prev: &Item, curr: &Item) -> Result<Bound, AppError> {
        if curr.timestamp != prev.timestamp {
            return Ok(Bound::with_timestamp(curr.timestamp));
        }

        let mut shared_prefix_bytes = 0usize;
        for index in 0..ID_SIZE {
            if curr.id[index] != prev.id[index] {
                break;
            }
            shared_prefix_bytes += 1;
        }

        Bound::with_timestamp_and_id(curr.timestamp, &curr.id[..shared_prefix_bytes + 1])
    }
}

fn decode_revision_id(revision_id: &str) -> Result<[u8; ID_SIZE], AppError> {
    let bytes = hex::decode(revision_id)
        .map_err(|e| AppError::custom(format!("Invalid revision hex: {e}")))?;
    if bytes.len() != ID_SIZE {
        return Err(AppError::custom(format!(
            "Invalid negentropy ID length: expected {ID_SIZE} bytes, got {}",
            bytes.len()
        )));
    }

    let mut id = [0u8; ID_SIZE];
    id.copy_from_slice(&bytes);
    Ok(id)
}

fn get_byte(encoded: &mut &[u8]) -> Result<u8, AppError> {
    Ok(get_bytes(encoded, 1)?[0])
}

fn get_bytes<'a>(encoded: &mut &'a [u8], length: usize) -> Result<&'a [u8], AppError> {
    if encoded.len() < length {
        return Err(AppError::custom("Negentropy parse ended prematurely"));
    }

    let bytes = &encoded[..length];
    *encoded = &encoded[length..];
    Ok(bytes)
}

fn get_byte_array<const N: usize>(encoded: &mut &[u8]) -> Result<[u8; N], AppError> {
    let bytes = get_bytes(encoded, N)?;
    let mut array = [0u8; N];
    array.copy_from_slice(bytes);
    Ok(array)
}

fn decode_var_int(encoded: &mut &[u8]) -> Result<u64, AppError> {
    let mut result = 0u64;

    loop {
        let byte = *encoded
            .first()
            .ok_or_else(|| AppError::custom("Negentropy parse ended prematurely"))?;
        *encoded = &encoded[1..];
        result = (result << 7) | u64::from(byte & 0x7f);
        if (byte & 0x80) == 0 {
            return Ok(result);
        }
    }
}

fn encode_var_int(mut value: u64) -> Vec<u8> {
    if value == 0 {
        return vec![0];
    }

    let mut output = Vec::new();
    while value > 0 {
        output.push((value & 0x7f) as u8);
        value >>= 7;
    }
    output.reverse();

    let prefix_len = output.len() - 1;
    for byte in &mut output[..prefix_len] {
        *byte |= 0x80;
    }

    output
}

fn add_id(accumulator: &mut [u8; ID_SIZE], id: &[u8; ID_SIZE]) {
    let mut curr_carry = 0u64;
    let mut next_carry = 0u64;

    for index in 0..8 {
        let offset = index * 4;
        let lhs = u32::from_le_bytes(accumulator[offset..offset + 4].try_into().unwrap()) as u64;
        let rhs = u32::from_le_bytes(id[offset..offset + 4].try_into().unwrap()) as u64;

        let mut next = lhs;
        next += curr_carry;
        next += rhs;
        if next > 0xffff_ffff {
            next_carry = 1;
        }

        accumulator[offset..offset + 4].copy_from_slice(&(next as u32).to_le_bytes());
        curr_carry = next_carry;
        next_carry = 0;
    }
}

fn item_cmp_bound(item: &Item, bound: &Bound) -> Ordering {
    match item.timestamp.cmp(&bound.timestamp) {
        Ordering::Equal => compare_item_id_to_bound_prefix(&item.id, &bound.id, bound.id_len),
        other => other,
    }
}

fn compare_item_id_to_bound_prefix(
    item_id: &[u8; ID_SIZE],
    bound_id: &[u8; ID_SIZE],
    bound_len: usize,
) -> Ordering {
    let shared = bound_len.min(ID_SIZE);

    for index in 0..shared {
        match item_id[index].cmp(&bound_id[index]) {
            Ordering::Equal => continue,
            other => return other,
        }
    }

    ID_SIZE.cmp(&bound_len)
}

#[cfg(test)]
mod tests {
    use super::*;

    const REV_A: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const REV_B: &str = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

    #[test]
    fn reconciles_identical_sets_to_completion() {
        let items = vec![
            RevisionNegentropyItem {
                revision_id: REV_A.into(),
                mtime: 1000,
            },
            RevisionNegentropyItem {
                revision_id: REV_B.into(),
                mtime: 2000,
            },
        ];
        let mut client = RevisionNegentropySession::new(&items, 0).unwrap();
        let mut server = RevisionNegentropySession::new(&items, 0).unwrap();

        let mut message = Some(client.initiate_hex().unwrap());
        while let Some(msg) = message {
            let server_reply = server.reconcile_hex(&msg).unwrap();
            let client_reply = client.reconcile_with_ids_hex(&server_reply).unwrap();

            assert!(client_reply.have.is_empty());
            assert!(client_reply.need.is_empty());

            message = client_reply.next_message_hex;
        }
    }

    #[test]
    fn discovers_missing_revision_ids() {
        let mut client = RevisionNegentropySession::new(
            &[RevisionNegentropyItem {
                revision_id: REV_A.into(),
                mtime: 1000,
            }],
            0,
        )
        .unwrap();
        let mut server = RevisionNegentropySession::new(
            &[
                RevisionNegentropyItem {
                    revision_id: REV_A.into(),
                    mtime: 1000,
                },
                RevisionNegentropyItem {
                    revision_id: REV_B.into(),
                    mtime: 2000,
                },
            ],
            0,
        )
        .unwrap();

        let mut message = Some(client.initiate_hex().unwrap());
        let mut final_need = Vec::new();

        while let Some(msg) = message {
            let server_reply = server.reconcile_hex(&msg).unwrap();
            let client_reply = client.reconcile_with_ids_hex(&server_reply).unwrap();

            final_need = client_reply.need.clone();
            message = client_reply.next_message_hex;
        }

        assert_eq!(final_need, vec![REV_B.to_string()]);
    }

    #[test]
    fn converges_with_reference_js_reply_for_empty_remote() {
        const REFERENCE_SERVER_REPLY: &str = "61876d000200050002000400020004000200040002000400020004000200040002000400020004000200040002000400020004000200040002000400020000000200";

        let items = (1..=50)
            .map(|index| RevisionNegentropyItem {
                revision_id: format!("{index:064x}"),
                mtime: 999 + index as u64,
            })
            .collect::<Vec<_>>();

        let mut client = RevisionNegentropySession::new(&items, 0).unwrap();
        let init = client.initiate_hex().unwrap();
        assert_eq!(init.len(), 612);

        let result = client
            .reconcile_with_ids_hex(REFERENCE_SERVER_REPLY)
            .unwrap();

        assert!(result.next_message_hex.is_none());
        assert_eq!(result.have.len(), 50);
        assert!(result.need.is_empty());
    }
}

use crate::error::AppError;
use negentropy::{Id, Negentropy, NegentropyStorageVector};

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

pub struct RevisionNegentropySession {
    inner: Negentropy<'static, NegentropyStorageVector>,
}

impl RevisionNegentropySession {
    pub fn new(items: &[RevisionNegentropyItem], frame_size_limit: u64) -> Result<Self, AppError> {
        let mut storage = NegentropyStorageVector::new();
        for item in items {
            let bytes = hex::decode(&item.revision_id)
                .map_err(|e| AppError::custom(format!("Invalid revision hex: {e}")))?;
            let id = Id::from_slice(&bytes)
                .map_err(|e| AppError::custom(format!("Invalid negentropy ID: {e}")))?;
            storage
                .insert(item.mtime, id)
                .map_err(|e| AppError::custom(format!("Failed to insert negentropy item: {e}")))?;
        }
        storage
            .seal()
            .map_err(|e| AppError::custom(format!("Failed to seal negentropy storage: {e}")))?;

        let inner = Negentropy::owned(storage, frame_size_limit)
            .map_err(|e| AppError::custom(format!("Failed to create negentropy session: {e}")))?;

        Ok(Self { inner })
    }

    pub fn initiate_hex(&mut self) -> Result<String, AppError> {
        self.inner
            .initiate()
            .map(hex::encode)
            .map_err(|e| AppError::custom(format!("Failed to initiate negentropy: {e}")))
    }

    pub fn reconcile_with_ids_hex(
        &mut self,
        message_hex: &str,
    ) -> Result<RevisionNegentropyOutput, AppError> {
        let bytes = hex::decode(message_hex)
            .map_err(|e| AppError::custom(format!("Invalid negentropy message hex: {e}")))?;

        let mut have_ids = Vec::new();
        let mut need_ids = Vec::new();
        let next_message = self
            .inner
            .reconcile_with_ids(&bytes, &mut have_ids, &mut need_ids)
            .map_err(|e| AppError::custom(format!("Negentropy reconciliation failed: {e}")))?;

        Ok(RevisionNegentropyOutput {
            next_message_hex: next_message.map(hex::encode),
            have: have_ids
                .into_iter()
                .map(|id| hex::encode(id.to_bytes()))
                .collect(),
            need: need_ids
                .into_iter()
                .map(|id| hex::encode(id.to_bytes()))
                .collect(),
        })
    }

    #[cfg(test)]
    pub fn reconcile_hex(&mut self, message_hex: &str) -> Result<String, AppError> {
        let bytes = hex::decode(message_hex)
            .map_err(|e| AppError::custom(format!("Invalid negentropy message hex: {e}")))?;

        self.inner
            .reconcile(&bytes)
            .map(hex::encode)
            .map_err(|e| AppError::custom(format!("Negentropy reconciliation failed: {e}")))
    }
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
}

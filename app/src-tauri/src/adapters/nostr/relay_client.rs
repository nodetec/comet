use crate::adapters::nostr::comet_note_snapshot::COMET_NOTE_SNAPSHOT_KIND;
use crate::error::AppError;
use futures_util::{SinkExt, StreamExt};
use nostr_sdk::prelude::{Event, EventBuilder, JsonUtil, Keys, RelayUrl};
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::time::Duration;
use tokio::net::TcpStream;
use tokio::time::timeout;
use tokio_tungstenite::{connect_async, tungstenite::Message, MaybeTlsStream, WebSocketStream};

type SnapshotRelayStream = WebSocketStream<MaybeTlsStream<TcpStream>>;
type SnapshotRelayWrite = futures_util::stream::SplitSink<SnapshotRelayStream, Message>;
type SnapshotRelayRead = futures_util::stream::SplitStream<SnapshotRelayStream>;

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
pub struct SnapshotRelayInfoDocument {
    pub name: String,
    pub description: String,
    pub software: String,
    pub version: String,
    pub supported_nips: Vec<serde_json::Value>,
    pub changes_feed: SnapshotRelayChangesFeedInfo,
    pub snapshot_sync: SnapshotRelaySyncInfo,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
pub struct SnapshotRelayChangesFeedInfo {
    pub min_seq: i64,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
pub struct SnapshotRelaySyncInfo {
    pub changes_feed: bool,
    pub author_scoped: bool,
    pub retention: SnapshotRelayRetentionInfo,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
pub struct SnapshotRelayRetentionInfo {
    pub current_snapshots_fetchable: bool,
    pub snapshot_retention: SnapshotRelaySnapshotRetentionInfo,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
pub struct SnapshotRelaySnapshotRetentionInfo {
    pub mode: String,
    pub recent_count: usize,
    pub min_created_at: Option<i64>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum SnapshotRelayIncomingMessage {
    Ok {
        event_id: String,
        accepted: bool,
        message: String,
    },
    Notice(String),
    Closed {
        subscription_id: String,
        message: String,
    },
    Eose {
        subscription_id: String,
    },
    Event {
        subscription_id: String,
        event: Event,
    },
    EventsBatch {
        subscription_id: String,
        events: Vec<Event>,
    },
    EventStatus {
        subscription_id: String,
        id: String,
        status: String,
    },
    ChangesStatus {
        subscription_id: String,
        mode: String,
        snapshot_seq: i64,
    },
    AuthChallenge {
        challenge: String,
    },
    ChangesSnapshot {
        subscription_id: String,
        event: Event,
    },
    ChangesEvent {
        subscription_id: String,
        seq: i64,
        event: Event,
    },
    ChangesEose {
        subscription_id: String,
        last_seq: i64,
    },
    ChangesErr {
        subscription_id: String,
        message: String,
    },
}

pub struct SnapshotRelayConnection {
    write: SnapshotRelayWrite,
    read: SnapshotRelayRead,
    pending: VecDeque<SnapshotRelayIncomingMessage>,
}

impl SnapshotRelayConnection {
    pub async fn connect(relay_url: &str) -> Result<Self, AppError> {
        let (stream, _) = connect_async(relay_url)
            .await
            .map_err(|e| AppError::custom(format!("WebSocket connection failed: {e}")))?;
        let (write, read) = stream.split();
        Ok(Self {
            write,
            read,
            pending: VecDeque::new(),
        })
    }

    pub async fn connect_authenticated(relay_url: &str, keys: &Keys) -> Result<Self, AppError> {
        let mut connection = Self::connect(relay_url).await?;
        connection.authenticate_if_needed(keys, relay_url).await?;
        Ok(connection)
    }

    pub async fn send_event(&mut self, event: &Event) -> Result<(), AppError> {
        let event_json: serde_json::Value = serde_json::from_str(&event.as_json())?;
        self.send_json(serde_json::json!(["EVENT", event_json]))
            .await
    }

    pub async fn send_changes_bootstrap(
        &mut self,
        subscription_id: &str,
        author_pubkey: &str,
    ) -> Result<(), AppError> {
        self.send_json(serde_json::json!([
            "CHANGES",
            subscription_id,
            {
                "mode": "bootstrap",
                "kinds": [COMET_NOTE_SNAPSHOT_KIND.as_u16()],
                "authors": [author_pubkey]
            }
        ]))
        .await
    }

    pub async fn send_changes(
        &mut self,
        subscription_id: &str,
        author_pubkey: &str,
        since: i64,
        live: bool,
    ) -> Result<(), AppError> {
        self.send_json(serde_json::json!([
            "CHANGES",
            subscription_id,
            {
                "mode": "tail",
                "since": since,
                "kinds": [COMET_NOTE_SNAPSHOT_KIND.as_u16()],
                "authors": [author_pubkey],
                "live": live
            }
        ]))
        .await
    }

    pub async fn recv_message(&mut self) -> Result<SnapshotRelayIncomingMessage, AppError> {
        if let Some(message) = self.pending.pop_front() {
            return Ok(message);
        }

        loop {
            let frame = self
                .read
                .next()
                .await
                .ok_or_else(|| AppError::custom("Connection closed"))?
                .map_err(|e| AppError::custom(format!("WebSocket error: {e}")))?;

            let text = match frame {
                Message::Text(text) => text.to_string(),
                Message::Binary(_) => {
                    return Err(AppError::custom("Unexpected binary message from relay"))
                }
                Message::Ping(payload) => {
                    self.write.send(Message::Pong(payload)).await.map_err(|e| {
                        AppError::custom(format!("Failed to send websocket pong: {e}"))
                    })?;
                    continue;
                }
                Message::Pong(_) => continue,
                Message::Close(_) => return Err(AppError::custom("Connection closed")),
                _ => continue,
            };

            return parse_relay_message(&text);
        }
    }

    async fn send_json(&mut self, value: serde_json::Value) -> Result<(), AppError> {
        self.write
            .send(Message::from(value.to_string()))
            .await
            .map_err(|e| AppError::custom(format!("Failed to send websocket message: {e}")))
    }

    async fn authenticate_if_needed(
        &mut self,
        keys: &Keys,
        relay_url: &str,
    ) -> Result<(), AppError> {
        let maybe_frame = timeout(Duration::from_millis(250), self.read.next()).await;
        let Some(frame) = (match maybe_frame {
            Ok(frame) => frame,
            Err(_) => return Ok(()),
        }) else {
            return Ok(());
        };

        let frame = frame.map_err(|e| AppError::custom(format!("WebSocket error: {e}")))?;
        let text = match frame {
            Message::Text(text) => text.to_string(),
            Message::Binary(_) => {
                return Err(AppError::custom(
                    "Unexpected binary message from relay during authentication",
                ))
            }
            Message::Ping(payload) => {
                self.write
                    .send(Message::Pong(payload))
                    .await
                    .map_err(|e| AppError::custom(format!("Failed to send websocket pong: {e}")))?;
                return Ok(());
            }
            Message::Pong(_) => return Ok(()),
            Message::Close(_) => return Err(AppError::custom("Connection closed")),
            _ => return Ok(()),
        };

        let message = parse_relay_message(&text)?;
        match message {
            SnapshotRelayIncomingMessage::AuthChallenge { challenge } => {
                self.send_auth(keys, relay_url, &challenge).await?;
                match self.recv_message().await? {
                    SnapshotRelayIncomingMessage::Ok { accepted: true, .. } => Ok(()),
                    SnapshotRelayIncomingMessage::Ok {
                        accepted: false,
                        message,
                        ..
                    } => Err(AppError::custom(format!(
                        "Relay authentication rejected: {message}"
                    ))),
                    other => Err(AppError::custom(format!(
                        "Unexpected relay response to AUTH: {other:?}"
                    ))),
                }
            }
            other => {
                self.pending.push_back(other);
                Ok(())
            }
        }
    }

    async fn send_auth(
        &mut self,
        keys: &Keys,
        relay_url: &str,
        challenge: &str,
    ) -> Result<(), AppError> {
        let relay_url = RelayUrl::parse(relay_url)
            .map_err(|e| AppError::custom(format!("Invalid relay url for AUTH: {e}")))?;
        let event = EventBuilder::auth(challenge, relay_url)
            .sign_with_keys(keys)
            .map_err(|e| AppError::custom(format!("Failed to sign relay AUTH event: {e}")))?;
        let event_json: serde_json::Value = serde_json::from_str(&event.as_json())?;
        self.send_json(serde_json::json!(["AUTH", event_json]))
            .await
    }
}

pub async fn fetch_relay_info(relay_http_url: &str) -> Result<SnapshotRelayInfoDocument, AppError> {
    let response = reqwest::Client::new()
        .get(relay_http_url)
        .header("Accept", "application/nostr+json")
        .send()
        .await
        .map_err(|e| AppError::custom(format!("Failed to fetch relay info: {e}")))?;

    if !response.status().is_success() {
        return Err(AppError::custom(format!(
            "Snapshot relay info request failed with status {}",
            response.status()
        )));
    }

    let body = response
        .text()
        .await
        .map_err(|e| AppError::custom(format!("Failed to read relay info body: {e}")))?;

    serde_json::from_str::<SnapshotRelayInfoDocument>(&body)
        .map_err(|e| AppError::custom(format!("Failed to parse relay info: {e}")))
}

pub fn parse_relay_message(text: &str) -> Result<SnapshotRelayIncomingMessage, AppError> {
    let value: serde_json::Value = serde_json::from_str(text)?;
    let arr = value
        .as_array()
        .ok_or_else(|| AppError::custom("Snapshot relay message was not an array"))?;

    match arr.first().and_then(|value| value.as_str()) {
        Some("OK") => Ok(SnapshotRelayIncomingMessage::Ok {
            event_id: arr
                .get(1)
                .and_then(serde_json::Value::as_str)
                .unwrap_or_default()
                .to_string(),
            accepted: arr
                .get(2)
                .and_then(serde_json::Value::as_bool)
                .unwrap_or(false),
            message: arr
                .get(3)
                .and_then(serde_json::Value::as_str)
                .unwrap_or_default()
                .to_string(),
        }),
        Some("NOTICE") => Ok(SnapshotRelayIncomingMessage::Notice(
            arr.get(1)
                .and_then(serde_json::Value::as_str)
                .unwrap_or_default()
                .to_string(),
        )),
        Some("CLOSED") => Ok(SnapshotRelayIncomingMessage::Closed {
            subscription_id: arr
                .get(1)
                .and_then(serde_json::Value::as_str)
                .unwrap_or_default()
                .to_string(),
            message: arr
                .get(2)
                .and_then(serde_json::Value::as_str)
                .unwrap_or_default()
                .to_string(),
        }),
        Some("EOSE") => Ok(SnapshotRelayIncomingMessage::Eose {
            subscription_id: arr
                .get(1)
                .and_then(serde_json::Value::as_str)
                .unwrap_or_default()
                .to_string(),
        }),
        Some("EVENT") => {
            let event_json = arr
                .get(2)
                .ok_or_else(|| AppError::custom("Missing event in EVENT response"))?;
            let event = Event::from_json(event_json.to_string())
                .map_err(|e| AppError::custom(format!("Invalid relay event: {e}")))?;
            Ok(SnapshotRelayIncomingMessage::Event {
                subscription_id: arr
                    .get(1)
                    .and_then(serde_json::Value::as_str)
                    .unwrap_or_default()
                    .to_string(),
                event,
            })
        }
        Some("EVENTS") => {
            let events_json = arr
                .get(2)
                .and_then(serde_json::Value::as_array)
                .ok_or_else(|| AppError::custom("Missing events in EVENTS response"))?;
            let mut events = Vec::with_capacity(events_json.len());
            for event_json in events_json {
                let event = Event::from_json(event_json.to_string())
                    .map_err(|e| AppError::custom(format!("Invalid relay event in EVENTS: {e}")))?;
                events.push(event);
            }
            Ok(SnapshotRelayIncomingMessage::EventsBatch {
                subscription_id: arr
                    .get(1)
                    .and_then(serde_json::Value::as_str)
                    .unwrap_or_default()
                    .to_string(),
                events,
            })
        }
        Some("EVENT-STATUS") => Ok(SnapshotRelayIncomingMessage::EventStatus {
            subscription_id: arr
                .get(1)
                .and_then(serde_json::Value::as_str)
                .unwrap_or_default()
                .to_string(),
            id: arr
                .get(2)
                .and_then(serde_json::Value::as_object)
                .and_then(|value| value.get("id"))
                .and_then(serde_json::Value::as_str)
                .unwrap_or_default()
                .to_string(),
            status: arr
                .get(2)
                .and_then(serde_json::Value::as_object)
                .and_then(|value| value.get("status"))
                .and_then(serde_json::Value::as_str)
                .unwrap_or_default()
                .to_string(),
        }),
        Some("AUTH") => Ok(SnapshotRelayIncomingMessage::AuthChallenge {
            challenge: arr
                .get(1)
                .and_then(serde_json::Value::as_str)
                .unwrap_or_default()
                .to_string(),
        }),
        Some("CHANGES") => match arr.get(2).and_then(serde_json::Value::as_str) {
            Some("STATUS") => Ok(SnapshotRelayIncomingMessage::ChangesStatus {
                subscription_id: arr
                    .get(1)
                    .and_then(serde_json::Value::as_str)
                    .unwrap_or_default()
                    .to_string(),
                mode: arr
                    .get(3)
                    .and_then(serde_json::Value::as_object)
                    .and_then(|value| value.get("mode"))
                    .and_then(serde_json::Value::as_str)
                    .unwrap_or_default()
                    .to_string(),
                snapshot_seq: arr
                    .get(3)
                    .and_then(serde_json::Value::as_object)
                    .and_then(|value| value.get("snapshot_seq"))
                    .and_then(serde_json::Value::as_i64)
                    .unwrap_or(0),
            }),
            Some("SNAPSHOT") => {
                let event_json = arr
                    .get(3)
                    .ok_or_else(|| AppError::custom("Missing event in CHANGES SNAPSHOT"))?;
                let event = Event::from_json(event_json.to_string()).map_err(|e| {
                    AppError::custom(format!("Invalid event in CHANGES SNAPSHOT: {e}"))
                })?;
                Ok(SnapshotRelayIncomingMessage::ChangesSnapshot {
                    subscription_id: arr
                        .get(1)
                        .and_then(serde_json::Value::as_str)
                        .unwrap_or_default()
                        .to_string(),
                    event,
                })
            }
            Some("EVENT") => {
                let event_json = arr
                    .get(4)
                    .ok_or_else(|| AppError::custom("Missing event in CHANGES EVENT"))?;
                let event = Event::from_json(event_json.to_string()).map_err(|e| {
                    AppError::custom(format!("Invalid event in CHANGES EVENT: {e}"))
                })?;
                Ok(SnapshotRelayIncomingMessage::ChangesEvent {
                    subscription_id: arr
                        .get(1)
                        .and_then(serde_json::Value::as_str)
                        .unwrap_or_default()
                        .to_string(),
                    seq: arr.get(3).and_then(serde_json::Value::as_i64).unwrap_or(0),
                    event,
                })
            }
            Some("EOSE") => Ok(SnapshotRelayIncomingMessage::ChangesEose {
                subscription_id: arr
                    .get(1)
                    .and_then(serde_json::Value::as_str)
                    .unwrap_or_default()
                    .to_string(),
                last_seq: arr.get(3).and_then(serde_json::Value::as_i64).unwrap_or(0),
            }),
            Some("ERR") => Ok(SnapshotRelayIncomingMessage::ChangesErr {
                subscription_id: arr
                    .get(1)
                    .and_then(serde_json::Value::as_str)
                    .unwrap_or_default()
                    .to_string(),
                message: arr
                    .get(3)
                    .and_then(serde_json::Value::as_str)
                    .unwrap_or_default()
                    .to_string(),
            }),
            _ => Err(AppError::custom("Unknown CHANGES response variant")),
        },
        _ => Err(AppError::custom("Unknown relay message type")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use nostr_sdk::Kind;

    #[test]
    fn parses_changes_status_message() {
        let message = parse_relay_message(
            r#"["CHANGES","bootstrap-1","STATUS",{"mode":"bootstrap","snapshot_seq":42}]"#,
        )
        .unwrap();

        assert_eq!(
            message,
            SnapshotRelayIncomingMessage::ChangesStatus {
                subscription_id: "bootstrap-1".into(),
                mode: "bootstrap".into(),
                snapshot_seq: 42,
            }
        );
    }

    #[test]
    fn parses_req_event_message() {
        let event = serde_json::json!({
            "id": "0000000000000000000000000000000000000000000000000000000000000001",
            "pubkey": "1111111111111111111111111111111111111111111111111111111111111111",
            "created_at": 1700000000,
            "kind": 42061,
            "tags": [["d","B181093E-A1A3-492F-BF55-6E661BFEA397"],["o","put"],["c","notes"]],
            "content": "ciphertext",
            "sig": "22222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222"
        });

        let message =
            parse_relay_message(&serde_json::json!(["EVENT", "fetch-1", event]).to_string())
                .unwrap();

        match message {
            SnapshotRelayIncomingMessage::Event {
                subscription_id,
                event,
            } => {
                assert_eq!(subscription_id, "fetch-1");
                assert_eq!(event.kind, Kind::Custom(42061));
            }
            _ => panic!("expected EVENT message"),
        }
    }

    #[test]
    fn parses_events_batch_message() {
        let event = serde_json::json!({
            "id": "0000000000000000000000000000000000000000000000000000000000000001",
            "pubkey": "1111111111111111111111111111111111111111111111111111111111111111",
            "created_at": 1700000000,
            "kind": 42061,
            "tags": [["d","B181093E-A1A3-492F-BF55-6E661BFEA397"],["o","put"],["c","notes"]],
            "content": "ciphertext",
            "sig": "22222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222"
        });

        let message =
            parse_relay_message(&serde_json::json!(["EVENTS", "fetch-1", [event]]).to_string())
                .unwrap();

        match message {
            SnapshotRelayIncomingMessage::EventsBatch {
                subscription_id,
                events,
            } => {
                assert_eq!(subscription_id, "fetch-1");
                assert_eq!(events.len(), 1);
                assert_eq!(events[0].kind, Kind::Custom(42061));
            }
            other => panic!("unexpected message: {other:?}"),
        }
    }

    #[test]
    fn parses_event_status_message() {
        let message = parse_relay_message(
            r#"["EVENT-STATUS","fetch-1",{"id":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","status":"payload_compacted"}]"#,
        )
        .unwrap();

        assert_eq!(
            message,
            SnapshotRelayIncomingMessage::EventStatus {
                subscription_id: "fetch-1".into(),
                id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa".into(),
                status: "payload_compacted".into(),
            }
        );
    }

    #[test]
    fn parses_auth_challenge_message() {
        let message = parse_relay_message(r#"["AUTH","challenge-123"]"#).unwrap();

        assert_eq!(
            message,
            SnapshotRelayIncomingMessage::AuthChallenge {
                challenge: "challenge-123".into(),
            }
        );
    }
}

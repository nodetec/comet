use crate::domain::sync::revision_codec::REVISION_SYNC_EVENT_KIND;
use crate::error::AppError;
use futures_util::{SinkExt, StreamExt};
use nostr_sdk::prelude::{Event, EventBuilder, JsonUtil, Keys, RelayUrl};
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::time::Duration;
use tokio::net::TcpStream;
use tokio::time::timeout;
use tokio_tungstenite::{connect_async, tungstenite::Message, MaybeTlsStream, WebSocketStream};

type RevisionRelayStream = WebSocketStream<MaybeTlsStream<TcpStream>>;
type RevisionRelayWrite = futures_util::stream::SplitSink<RevisionRelayStream, Message>;
type RevisionRelayRead = futures_util::stream::SplitStream<RevisionRelayStream>;

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
pub struct RevisionRelayInfoDocument {
    pub name: String,
    pub description: String,
    pub software: String,
    pub version: String,
    pub supported_nips: Vec<serde_json::Value>,
    pub changes_feed: RevisionRelayChangesFeedInfo,
    pub revision_sync: RevisionRelaySyncInfo,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
pub struct RevisionRelayChangesFeedInfo {
    pub min_seq: i64,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
pub struct RevisionRelaySyncInfo {
    pub strategy: String,
    pub current_head_negentropy: bool,
    pub changes_feed: bool,
    pub recipient_scoped: bool,
    #[serde(default)]
    pub batch_fetch: bool,
    pub retention: RevisionRelayRetentionInfo,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
pub struct RevisionRelayRetentionInfo {
    pub min_payload_mtime: Option<i64>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum RevisionRelayIncomingMessage {
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
        rev: String,
        status: String,
    },
    NegStatus {
        subscription_id: String,
        strategy: String,
        snapshot_seq: i64,
    },
    NegMsg {
        subscription_id: String,
        payload: String,
    },
    NegErr {
        subscription_id: String,
        message: String,
    },
    AuthChallenge {
        challenge: String,
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

pub struct RevisionRelayConnection {
    write: RevisionRelayWrite,
    read: RevisionRelayRead,
    pending: VecDeque<RevisionRelayIncomingMessage>,
}

impl RevisionRelayConnection {
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

    pub async fn send_neg_open(
        &mut self,
        subscription_id: &str,
        recipient: &str,
    ) -> Result<(), AppError> {
        self.send_json(serde_json::json!([
            "NEG-OPEN",
            subscription_id,
            {
                "kinds": [REVISION_SYNC_EVENT_KIND.as_u16()],
                "#p": [recipient]
            }
        ]))
        .await
    }

    pub async fn send_neg_msg(
        &mut self,
        subscription_id: &str,
        payload: &str,
    ) -> Result<(), AppError> {
        self.send_json(serde_json::json!(["NEG-MSG", subscription_id, payload]))
            .await
    }

    pub async fn send_neg_close(&mut self, subscription_id: &str) -> Result<(), AppError> {
        self.send_json(serde_json::json!(["NEG-CLOSE", subscription_id]))
            .await
    }

    pub async fn send_req_revisions(
        &mut self,
        subscription_id: &str,
        recipient: &str,
        revision_ids: &[String],
    ) -> Result<(), AppError> {
        self.send_json(serde_json::json!([
            "REQ",
            subscription_id,
            {
                "kinds": [REVISION_SYNC_EVENT_KIND.as_u16()],
                "#p": [recipient],
                "#r": revision_ids,
            }
        ]))
        .await
    }

    pub async fn send_req_revisions_batch(
        &mut self,
        subscription_id: &str,
        recipient: &str,
        revision_ids: &[String],
    ) -> Result<(), AppError> {
        self.send_json(serde_json::json!([
            "REQ-BATCH",
            subscription_id,
            {
                "kinds": [REVISION_SYNC_EVENT_KIND.as_u16()],
                "#p": [recipient],
                "#r": revision_ids,
            }
        ]))
        .await
    }

    pub async fn send_changes(
        &mut self,
        subscription_id: &str,
        recipient: &str,
        since: i64,
        live: bool,
    ) -> Result<(), AppError> {
        self.send_json(serde_json::json!([
            "CHANGES",
            subscription_id,
            {
                "since": since,
                "kinds": [REVISION_SYNC_EVENT_KIND.as_u16()],
                "#p": [recipient],
                "live": live
            }
        ]))
        .await
    }

    pub async fn recv_message(&mut self) -> Result<RevisionRelayIncomingMessage, AppError> {
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
            RevisionRelayIncomingMessage::AuthChallenge { challenge } => {
                self.send_auth(keys, relay_url, &challenge).await?;
                match self.recv_message().await? {
                    RevisionRelayIncomingMessage::Ok { accepted: true, .. } => Ok(()),
                    RevisionRelayIncomingMessage::Ok {
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

pub async fn fetch_relay_info(relay_http_url: &str) -> Result<RevisionRelayInfoDocument, AppError> {
    let response = reqwest::Client::new()
        .get(relay_http_url)
        .header("Accept", "application/nostr+json")
        .send()
        .await
        .map_err(|e| AppError::custom(format!("Failed to fetch relay info: {e}")))?;

    if !response.status().is_success() {
        return Err(AppError::custom(format!(
            "Revision relay info request failed with status {}",
            response.status()
        )));
    }

    let body = response
        .text()
        .await
        .map_err(|e| AppError::custom(format!("Failed to read relay info body: {e}")))?;

    serde_json::from_str::<RevisionRelayInfoDocument>(&body)
        .map_err(|e| AppError::custom(format!("Failed to parse relay info: {e}")))
}

pub fn parse_relay_message(text: &str) -> Result<RevisionRelayIncomingMessage, AppError> {
    let value: serde_json::Value = serde_json::from_str(text)?;
    let arr = value
        .as_array()
        .ok_or_else(|| AppError::custom("Revision relay message was not an array"))?;

    match arr.first().and_then(|value| value.as_str()) {
        Some("OK") => Ok(RevisionRelayIncomingMessage::Ok {
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
        Some("NOTICE") => Ok(RevisionRelayIncomingMessage::Notice(
            arr.get(1)
                .and_then(serde_json::Value::as_str)
                .unwrap_or_default()
                .to_string(),
        )),
        Some("CLOSED") => Ok(RevisionRelayIncomingMessage::Closed {
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
        Some("EOSE") => Ok(RevisionRelayIncomingMessage::Eose {
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
            Ok(RevisionRelayIncomingMessage::Event {
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
            Ok(RevisionRelayIncomingMessage::EventsBatch {
                subscription_id: arr
                    .get(1)
                    .and_then(serde_json::Value::as_str)
                    .unwrap_or_default()
                    .to_string(),
                events,
            })
        }
        Some("EVENT-STATUS") => Ok(RevisionRelayIncomingMessage::EventStatus {
            subscription_id: arr
                .get(1)
                .and_then(serde_json::Value::as_str)
                .unwrap_or_default()
                .to_string(),
            rev: arr
                .get(2)
                .and_then(serde_json::Value::as_object)
                .and_then(|value| value.get("rev"))
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
        Some("NEG-STATUS") => Ok(RevisionRelayIncomingMessage::NegStatus {
            subscription_id: arr
                .get(1)
                .and_then(serde_json::Value::as_str)
                .unwrap_or_default()
                .to_string(),
            strategy: arr
                .get(2)
                .and_then(serde_json::Value::as_object)
                .and_then(|value| value.get("strategy"))
                .and_then(serde_json::Value::as_str)
                .unwrap_or_default()
                .to_string(),
            snapshot_seq: arr
                .get(2)
                .and_then(serde_json::Value::as_object)
                .and_then(|value| value.get("snapshot_seq"))
                .and_then(serde_json::Value::as_i64)
                .unwrap_or(0),
        }),
        Some("NEG-MSG") => Ok(RevisionRelayIncomingMessage::NegMsg {
            subscription_id: arr
                .get(1)
                .and_then(serde_json::Value::as_str)
                .unwrap_or_default()
                .to_string(),
            payload: arr
                .get(2)
                .and_then(serde_json::Value::as_str)
                .unwrap_or_default()
                .to_string(),
        }),
        Some("NEG-ERR") => Ok(RevisionRelayIncomingMessage::NegErr {
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
        Some("AUTH") => Ok(RevisionRelayIncomingMessage::AuthChallenge {
            challenge: arr
                .get(1)
                .and_then(serde_json::Value::as_str)
                .unwrap_or_default()
                .to_string(),
        }),
        Some("CHANGES") => match arr.get(2).and_then(serde_json::Value::as_str) {
            Some("EVENT") => {
                let event_json = arr
                    .get(4)
                    .ok_or_else(|| AppError::custom("Missing event in CHANGES EVENT"))?;
                let event = Event::from_json(event_json.to_string()).map_err(|e| {
                    AppError::custom(format!("Invalid event in CHANGES EVENT: {e}"))
                })?;
                Ok(RevisionRelayIncomingMessage::ChangesEvent {
                    subscription_id: arr
                        .get(1)
                        .and_then(serde_json::Value::as_str)
                        .unwrap_or_default()
                        .to_string(),
                    seq: arr.get(3).and_then(serde_json::Value::as_i64).unwrap_or(0),
                    event,
                })
            }
            Some("EOSE") => Ok(RevisionRelayIncomingMessage::ChangesEose {
                subscription_id: arr
                    .get(1)
                    .and_then(serde_json::Value::as_str)
                    .unwrap_or_default()
                    .to_string(),
                last_seq: arr.get(3).and_then(serde_json::Value::as_i64).unwrap_or(0),
            }),
            Some("ERR") => Ok(RevisionRelayIncomingMessage::ChangesErr {
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
    fn parses_neg_status_message() {
        let message = parse_relay_message(
            r#"["NEG-STATUS","neg-1",{"strategy":"revision-sync.v1","snapshot_seq":42}]"#,
        )
        .unwrap();

        assert_eq!(
            message,
            RevisionRelayIncomingMessage::NegStatus {
                subscription_id: "neg-1".into(),
                strategy: "revision-sync.v1".into(),
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
            "kind": 1059,
            "tags": [["p","recipient"],["d","doc"],["r","aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"],["m","1700000000000"],["op","put"],["t","note"],["v","2"]],
            "content": "ciphertext",
            "sig": "22222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222"
        });

        let message =
            parse_relay_message(&serde_json::json!(["EVENT", "fetch-1", event]).to_string())
                .unwrap();

        match message {
            RevisionRelayIncomingMessage::Event {
                subscription_id,
                event,
            } => {
                assert_eq!(subscription_id, "fetch-1");
                assert_eq!(event.kind, Kind::GiftWrap);
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
            "kind": 1059,
            "tags": [["p","recipient"],["d","doc"],["r","aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"],["m","1700000000000"],["op","put"],["t","note"],["v","2"]],
            "content": "ciphertext",
            "sig": "22222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222"
        });

        let message =
            parse_relay_message(&serde_json::json!(["EVENTS", "fetch-1", [event]]).to_string())
                .unwrap();

        match message {
            RevisionRelayIncomingMessage::EventsBatch {
                subscription_id,
                events,
            } => {
                assert_eq!(subscription_id, "fetch-1");
                assert_eq!(events.len(), 1);
                assert_eq!(events[0].kind, Kind::Custom(1059));
            }
            other => panic!("unexpected message: {other:?}"),
        }
    }

    #[test]
    fn parses_event_status_message() {
        let message = parse_relay_message(
            r#"["EVENT-STATUS","fetch-1",{"rev":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","status":"payload_compacted"}]"#,
        )
        .unwrap();

        assert_eq!(
            message,
            RevisionRelayIncomingMessage::EventStatus {
                subscription_id: "fetch-1".into(),
                rev: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa".into(),
                status: "payload_compacted".into(),
            }
        );
    }

    #[test]
    fn parses_auth_challenge_message() {
        let message = parse_relay_message(r#"["AUTH","challenge-123"]"#).unwrap();

        assert_eq!(
            message,
            RevisionRelayIncomingMessage::AuthChallenge {
                challenge: "challenge-123".into(),
            }
        );
    }
}

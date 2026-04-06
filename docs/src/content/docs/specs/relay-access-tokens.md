---
title: Relay Access Tokens
description: Draft NIP defining a TOKEN message for relay access authorization, decoupling identity from access control.
sidebar:
  label: Access Tokens
  order: 6
---

`draft` `optional` `relay`

## Summary

This NIP defines a `TOKEN` message that clients send over an open WebSocket connection to authorize relay access using an opaque bearer token. It complements [NIP-42](https://github.com/nostr-protocol/nips/blob/master/42.md) authentication, which proves _identity_ (which pubkey is speaking), by adding a separate _authorization_ layer (whether the connection is permitted to use the relay).

## Motivation

NIP-42 ties relay access to individual pubkeys. A relay that restricts access must maintain an allowlist of every pubkey that is permitted to connect. This creates friction in several real-world scenarios:

- **Multiple accounts.** A user with separate personal and professional keypairs must have each pubkey individually whitelisted.
- **AI agents.** A user running autonomous agents with dedicated keypairs needs each agent pubkey added to the relay's allowlist.
- **Key rotation.** When a user generates a new keypair, their relay access breaks until the new pubkey is manually re-authorized.
- **Device-specific keys.** Users who generate per-device keypairs (for security isolation) must register every device.

In all of these cases, the user is a single paying customer with a single entitlement. The relay should not need to know or track every pubkey they might use.

A relay access token solves this by decoupling the two concerns:

| Concern       | Mechanism          | Question answered             |
| ------------- | ------------------ | ----------------------------- |
| Identity      | NIP-42 `AUTH`      | _Which pubkey is this?_       |
| Authorization | `TOKEN` (this NIP) | _Is this connection allowed?_ |

The token represents the customer's access entitlement. Any pubkey presenting a valid token is authorized to use the relay, subject to the token's constraints.

## Definitions

### `TOKEN` client message

Clients send a `TOKEN` message to present an access token to the relay:

```
["TOKEN", <token-string>]
```

- `<token-string>` is an opaque string whose format is relay-defined. Relays MAY use any token format (random strings, JWTs, signed Nostr events, etc.).
- Clients MUST send `TOKEN` over the WebSocket connection, never as a URL query parameter or HTTP header, to prevent token leakage in server logs, proxy logs, or referrer headers.
- Clients MAY send `TOKEN` at any point after the WebSocket connection is established.
- Clients SHOULD send `TOKEN` before `AUTH` or any `REQ`/`EVENT` messages when the relay requires token-based access.

### `TOKEN` relay response

Relays respond to `TOKEN` messages with an `OK`-style acknowledgment:

```
["TOKEN", <token-string>, <success-boolean>, <message-string>]
```

Examples:

```jsonc
// Success
["TOKEN", "sk_abc123...", true, ""]

// Expired token
["TOKEN", "sk_abc123...", false, "token-invalid: token has expired"]

// Revoked token
["TOKEN", "sk_abc123...", false, "token-invalid: token has been revoked"]

// Rate limited
["TOKEN", "sk_abc123...", false, "token-invalid: too many connections for this token"]
```

### Machine-readable prefixes

This NIP defines the following prefixes for the message string in `TOKEN` responses and in `OK`/`CLOSED` messages:

- `"token-required: "` — the relay requires a valid token and the client has not presented one.
- `"token-invalid: "` — the client presented a token but it was rejected (expired, revoked, malformed, over quota, etc.).

Relays MAY use these prefixes in `OK` responses (to rejected `EVENT` writes) and `CLOSED` responses (to rejected `REQ` subscriptions) when the rejection is due to a missing or invalid token, instead of or alongside `auth-required:`.

## Protocol Flow

### Token before authentication

The typical flow for a relay that requires both a token and NIP-42 authentication:

```
client: <opens WebSocket>
relay:  ["AUTH", "<challenge>"]
client: ["TOKEN", "sk_abc123..."]
relay:  ["TOKEN", "sk_abc123...", true, ""]
client: ["AUTH", <signed-event>]
relay:  ["OK", "<event-id>", true, ""]
client: ["REQ", "sub_1", {"authors": ["<pubkey>"], ...}]
relay:  ["EVENT", "sub_1", {...}]
...
```

### Token-only access

A relay MAY accept a `TOKEN` as sufficient authorization without requiring NIP-42 `AUTH`, for use cases where the relay does not need to verify pubkey identity (e.g., read-only public data behind a paywall):

```
client: <opens WebSocket>
client: ["TOKEN", "sk_abc123..."]
relay:  ["TOKEN", "sk_abc123...", true, ""]
client: ["REQ", "sub_1", {"kinds": [1], "limit": 50}]
relay:  ["EVENT", "sub_1", {...}]
...
```

### Lazy token request

A relay MAY defer requesting a token until the client attempts an operation that requires one:

```
client: <opens WebSocket>
client: ["REQ", "sub_1", {"authors": ["<pubkey>"]}]
relay:  ["CLOSED", "sub_1", "token-required: present a valid access token"]
client: ["TOKEN", "sk_abc123..."]
relay:  ["TOKEN", "sk_abc123...", true, ""]
client: ["REQ", "sub_1", {"authors": ["<pubkey>"]}]
relay:  ["EVENT", "sub_1", {...}]
...
```

### Multiple pubkeys, one token

The scenario this NIP primarily addresses — a single customer using multiple keypairs through one token:

```
client: <opens WebSocket>
client: ["TOKEN", "sk_abc123..."]
relay:  ["TOKEN", "sk_abc123...", true, ""]
client: ["AUTH", <signed-event-for-pubkey-A>]
relay:  ["OK", "<event-id>", true, ""]
client: ["AUTH", <signed-event-for-pubkey-B>]
relay:  ["OK", "<event-id>", true, ""]
client: ["REQ", "sub_1", {"authors": ["<pubkey-A>", "<pubkey-B>"]}]
relay:  ["EVENT", "sub_1", {...}]
...
```

Both pubkeys are authenticated (NIP-42) and authorized (TOKEN) on the same connection.

## Token Lifecycle

Tokens are managed out-of-band by the relay operator. This NIP does not define token provisioning, rotation, or revocation protocols — these are relay-specific concerns, typically handled through a web dashboard, API, or account management system.

Relays SHOULD support the following lifecycle operations (implementation-defined):

- **Issuance** — generate a token tied to a customer account or subscription.
- **Expiration** — tokens MAY have an expiry time, after which the relay rejects them.
- **Revocation** — relay operators SHOULD be able to revoke tokens immediately.
- **Rotation** — customers SHOULD be able to generate a new token and invalidate the old one.

When a token expires or is revoked mid-session, the relay SHOULD close active subscriptions with:

```
["CLOSED", "<sub-id>", "token-invalid: token has been revoked"]
```

## Relay Information Extension

Relays that support token-based access SHOULD advertise this in their [NIP-11](https://github.com/nostr-protocol/nips/blob/master/11.md) relay information document:

```jsonc
{
  "supported_nips": [42, "XX"],
  "access_token": {
    "required": true, // false if token is optional (e.g., grants higher limits)
    "management_url": "https://relay.example.com/account",
  },
}
```

- `required` — whether a valid token is needed to use the relay at all, or whether tokens are optional (e.g., granting higher rate limits or storage quotas to token holders).
- `management_url` — a URL where users can obtain or manage their tokens.

## Security Considerations

- **Transport.** Tokens MUST only be sent over `wss://` (TLS-encrypted WebSocket) connections. Clients MUST NOT send tokens over unencrypted `ws://` connections.
- **No URL parameters.** Tokens MUST NOT be sent as query parameters in the WebSocket URL. Query parameters persist in browser history, server access logs, proxy logs, and referrer headers.
- **Token secrecy.** Clients MUST treat tokens as secrets and store them with the same care as private keys (encrypted storage, keychain, etc.).
- **Scope limitation.** A token grants relay access. It does not grant the ability to sign events, impersonate pubkeys, or perform any cryptographic operation. Identity remains entirely within NIP-42.
- **Rate limiting.** Relays SHOULD enforce per-token connection limits to prevent a leaked token from being used for abuse.
- **Relay trust.** The relay sees the token in plaintext. Users should only send tokens to relays they trust, the same as any bearer credential.

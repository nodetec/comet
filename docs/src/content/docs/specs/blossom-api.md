---
title: Blossom Blob Storage API
description: HTTP endpoints, auth requirements, and response shapes for Comet's Blossom blob storage service.
sidebar:
  label: Blossom API
---

Blossom is Comet's blob storage service. It stores blob metadata and ownership
in Postgres, and stores blob bytes in S3-compatible object storage.

## Base Behavior

- Blob IDs are lowercase hex SHA-256 hashes.
- `GET /:sha256` redirects to the public object-storage URL.
- `HEAD /:sha256` returns blob metadata without redirecting.
- Upload, delete, and list operations use Nostr Blossom auth.
- Admin deletion uses a bearer token instead of Nostr auth.

## Authentication

### Nostr auth

These endpoints require an `Authorization` header in this form:

```http
Authorization: Nostr <base64url-encoded event JSON>
```

Expected Blossom actions:

- `upload`
- `delete`
- `list`

The event kind is `24242`.

For delete requests, the auth event must also include an `x` tag matching the
blob SHA-256.

### Admin auth

Admin deletion uses:

```http
Authorization: Bearer <ADMIN_TOKEN>
```

## Endpoints

| Method   | Path             | Auth             | Purpose                                                |
| -------- | ---------------- | ---------------- | ------------------------------------------------------ |
| `GET`    | `/`              | None             | Service banner                                         |
| `GET`    | `/healthz`       | None             | Health check                                           |
| `PUT`    | `/upload`        | Nostr (`upload`) | Upload a blob                                          |
| `GET`    | `/:sha256`       | None             | Redirect to blob URL                                   |
| `HEAD`   | `/:sha256`       | None             | Return blob metadata headers                           |
| `DELETE` | `/:sha256`       | Nostr (`delete`) | Remove caller's ownership, delete object if last owner |
| `GET`    | `/list/:pubkey`  | Nostr (`list`)   | List blobs owned by a pubkey                           |
| `DELETE` | `/admin/:sha256` | Bearer token     | Hard-delete blob as admin                              |

## Endpoint Details

### `GET /`

Returns plain text:

```text
Comet Blossom
```

### `GET /healthz`

Returns plain text:

```text
ok
```

### `PUT /upload`

Uploads raw blob bytes. The server computes the SHA-256 from the request body.

#### Request headers

```http
Authorization: Nostr <...>
Content-Type: <mime-type>
```

#### Request body

Raw bytes.

#### Success response

```json
{
  "url": "https://cdn.example.com/blossom/<sha256>",
  "sha256": "<sha256>",
  "size": 12345,
  "type": "image/png",
  "uploaded": 1712345678
}
```

#### Error responses

- `400` if the body is empty
- `401` if auth is missing or invalid
- `507` if storage quota would be exceeded
- `500` if object storage upload fails

### `GET /:sha256`

Looks up the blob and returns a redirect.

#### Success response

- Status: `302 Found`
- Header: `Location: <public blob URL>`

#### Error responses

- `404` if the blob does not exist

### `HEAD /:sha256`

Returns metadata headers for an existing blob.

#### Success headers

```http
Content-Length: <size>
Content-Type: <mime-type>
X-Content-Sha256: <sha256>
```

#### Error responses

- `404` if the blob does not exist

### `DELETE /:sha256`

Deletes the authenticated user's ownership of the blob.

If that user is the last owner, Blossom also deletes the underlying object and
blob record.

#### Request headers

```http
Authorization: Nostr <...>
```

#### Success response

```json
{
  "deleted": true
}
```

#### Error responses

- `401` if auth is missing or invalid
- `403` if the caller is not an owner
- `404` if the blob does not exist

### `GET /list/:pubkey`

Lists blobs owned by the specified pubkey.

The signed pubkey must match the `:pubkey` in the path.

#### Request headers

```http
Authorization: Nostr <...>
```

#### Success response

```json
[
  {
    "url": "https://cdn.example.com/blossom/<sha256>",
    "sha256": "<sha256>",
    "size": 12345,
    "type": "image/png",
    "uploaded": 1712345678
  }
]
```

#### Error responses

- `401` if auth is missing or invalid
- `403` if the auth pubkey does not match the path pubkey

### `DELETE /admin/:sha256`

Admin-only hard delete.

This removes the blob from object storage and deletes the metadata record.

#### Request headers

```http
Authorization: Bearer <ADMIN_TOKEN>
```

#### Success response

```json
{
  "deleted": true
}
```

#### Error responses

- `401` if the bearer token is missing or incorrect
- `404` if the blob does not exist
- `503` if admin auth is not configured on the server

## Notes

- `OPTIONS` is supported for CORS preflight.
- Allowed CORS methods are `GET`, `HEAD`, `PUT`, `DELETE`, and `OPTIONS`.
- Exposed response headers include `Content-Length`, `Content-Type`, and
  `X-Content-Sha256`.

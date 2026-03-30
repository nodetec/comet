---
title: Blossom Batch Upload
description: Draft BUD proposal for backward-compatible multi-blob Blossom upload.
---

# Blossom Batch Upload

This document drafts a backward-compatible Blossom extension for uploading multiple blobs in one request.

It is intentionally not part of the current Blossom spec. It is a proposed BUD shape that keeps existing Blossom semantics intact by introducing a new endpoint rather than changing `PUT /upload`.

## Status

- Draft proposal
- Not a published Blossom BUD
- Intended to be compatible with current Blossom BUD-02, BUD-06, and BUD-11 semantics

## Why It Exists

Current Blossom upload is single-blob shaped:

- `PUT /upload` accepts one binary request body
- `HEAD /upload` validates one hash, one size, and one MIME type
- upload auth scopes naturally to one implied blob hash

That works well for independent blob storage, but it creates extra request overhead for note sync flows where one logical publish may need several attachments.

Batch upload reduces:

- HTTP request count
- repeated auth verification
- repeated storage-limit checks
- repeated round trips for attachment-heavy note sync

## Compatibility Goals

This proposal is designed to avoid breaking existing Blossom clients and servers.

- `PUT /upload` remains unchanged
- `HEAD /upload` remains unchanged
- single-blob auth and hash semantics remain unchanged
- clients must treat batch upload as optional
- servers may implement batch upload without affecting standard Blossom behavior

## Endpoint

```http
POST /upload-batch
Content-Type: multipart/form-data; boundary=...
Authorization: Nostr <base64url event>
```

Why a new endpoint:

- `PUT /upload` currently hashes the exact request body, so `multipart/form-data` would hash the multipart envelope rather than a blob
- overloading `/upload` would break the existing “one body equals one blob” rule
- a new endpoint keeps BUD-02 intact

## Request Format

The request body is `multipart/form-data` with:

- exactly one `manifest` part containing JSON
- one binary part per upload item

Example manifest:

```json
{
  "uploads": [
    {
      "part": "file-1",
      "sha256": "88a74d0b866c8ba79251a11fe5ac807839226870e77355f02eaf68b156522576",
      "size": 184292,
      "type": "application/pdf",
      "filename": "paper.pdf"
    },
    {
      "part": "file-2",
      "sha256": "2c26b46b68ffc68ff99b453c1d30413413422f1640bae4b6d1fbbf4b1b0e9c4f",
      "size": 1234,
      "type": "image/png",
      "filename": "diagram.png"
    }
  ]
}
```

Rules:

- `manifest` must be valid JSON
- each `uploads[*].part` must match one multipart file part name
- each file part must contain exactly one blob
- servers must compute SHA-256 over each file part body, not over the multipart envelope
- servers must not modify blob bytes before hashing or persisting them
- `filename` is advisory only

## Authorization

This proposal reuses Blossom auth from BUD-11.

Required auth shape:

- `kind: 24242`
- `t=upload`
- standard `expiration` handling
- optional `server` tags as in BUD-11

Hash scoping for batch upload:

- clients should include one `x` tag per uploaded blob hash
- if one or more `x` tags are present, the server must require that every uploaded blob hash appears in an `x` tag
- a token must not authorize blobs whose hashes are absent from the uploaded parts

This is stricter than single-blob `PUT /upload`, because the request implies multiple blob hashes instead of one `X-SHA-256`.

## Server Processing Rules

For each manifest item, the server should:

1. locate the matching multipart file part
2. compute the SHA-256 of the exact part body
3. verify it matches the manifest `sha256`
4. verify size and MIME expectations if provided
5. apply normal upload authorization and policy checks
6. persist the blob or attach ownership if the blob already exists
7. return a Blob Descriptor for successful items

Servers may deduplicate existing blobs exactly as they do for `PUT /upload`.

## Responses

### Full success

If every blob succeeds, the server should return `200 OK`:

```json
{
  "uploaded": [
    {
      "part": "file-1",
      "descriptor": {
        "url": "https://cdn.example.com/88a74d0b866c8ba79251a11fe5ac807839226870e77355f02eaf68b156522576.pdf",
        "sha256": "88a74d0b866c8ba79251a11fe5ac807839226870e77355f02eaf68b156522576",
        "size": 184292,
        "type": "application/pdf",
        "uploaded": 1774896077
      }
    }
  ]
}
```

### Partial success

If some blobs succeed and others fail, the server may return `207 Multi-Status`:

```json
{
  "results": [
    {
      "part": "file-1",
      "status": 200,
      "descriptor": {
        "url": "https://cdn.example.com/88a74d0b866c8ba79251a11fe5ac807839226870e77355f02eaf68b156522576.pdf",
        "sha256": "88a74d0b866c8ba79251a11fe5ac807839226870e77355f02eaf68b156522576",
        "size": 184292,
        "type": "application/pdf",
        "uploaded": 1774896077
      }
    },
    {
      "part": "file-2",
      "status": 413,
      "error": "file too large"
    }
  ]
}
```

### Whole-request failure

Servers should use normal `4xx` or `5xx` responses when the request itself is invalid, for example:

- malformed multipart body
- missing `manifest` part
- duplicate or unknown `part` references
- invalid authorization token
- manifest/file hash mismatch

## Relationship to Existing Blossom Endpoints

This proposal does not replace `PUT /upload`.

- clients may continue using standard single-blob upload
- servers may support only `PUT /upload`
- clients should fall back to single-blob upload when batch upload is unavailable

## Suggested Capability Advertisement

If Blossom evolves a capability advertisement document, this proposal should be advertised explicitly, for example:

```json
{
  "batch_upload": true,
  "max_batch_items": 32,
  "max_batch_bytes": 52428800,
  "partial_success": true
}
```

Until then, clients should treat `POST /upload-batch` support as implementation-specific.

## Open Questions

- Should partial success be required, optional, or forbidden?
- Should there be a `HEAD /upload-batch` preflight endpoint for validating a manifest before sending bytes?
- Should manifest `type` be required or advisory?
- Should the response preserve request order, or may it be server-defined?
- Should uploaded parts be allowed to omit `filename` entirely?

## Recommendation

If proposed upstream, this should be a new BUD with a new endpoint, not a reinterpretation of BUD-02.

That keeps current Blossom upload semantics stable while allowing attachment-heavy clients to reduce upload overhead substantially.

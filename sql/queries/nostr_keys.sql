-- NostrKey Queries
-- name: CreateNostrKey :one
INSERT INTO
  nostr_keys (nsec, npub, active, logged_in, created_at, modified_at)
VALUES
  (?, ?, ?, ?, ?, ?) RETURNING id,
  nsec,
  npub,
  active,
  logged_in,
  created_at,
  modified_at;

-- name: GetNostrKey :one
SELECT id, nsec, npub, active, logged_in, created_at, modified_at FROM nostr_keys WHERE id = ?;

-- name: ListNostrKeys :many
SELECT id, nsec, npub, active, logged_in, created_at, modified_at FROM nostr_keys;

-- name: UpdateNostrKey :exec
UPDATE nostr_keys SET nsec = ?, npub = ?, active = ?, logged_in = ?, created_at = ?, modified_at = ? WHERE id = ?;

-- name: DeleteNostrKey :exec
DELETE FROM nostr_keys WHERE id = ?;
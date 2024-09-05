-- Relay Queries
-- name: CreateRelay :one
INSERT INTO
  relay (url, read, write, sync, created_at, modified_at)
VALUES
  (?, ?, ?, ?, ?, ?) RETURNING id,
  url,
  read,
  write,
  sync,
  created_at,
  modified_at;

-- name: GetRelay :one
SELECT id, url, read, write, sync, created_at, modified_at FROM relay WHERE id = ?;

-- name: ListRelays :many
SELECT id, url, read, write, sync, created_at, modified_at FROM relay;

-- name: UpdateRelay :exec
UPDATE relay SET url = ?, read = ?, write = ?, sync = ?, created_at = ?, modified_at = ? WHERE id = ?;

-- name: DeleteRelays :exec
DELETE FROM relay;

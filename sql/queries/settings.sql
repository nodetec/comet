-- Settings Queries

-- name: CreateSetting :one
INSERT INTO settings (key, value)
VALUES (?, ?)
RETURNING key, value;

-- name: GetSetting :one
SELECT key, value
FROM settings
WHERE key = ?;

-- name: UpdateSetting :exec
UPDATE settings
SET value = ?
WHERE key = ?;

-- name: DeleteSetting :exec
DELETE FROM settings WHERE key = ?;


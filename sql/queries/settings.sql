-- Settings Queries
-- name: GetSetting :one
SELECT
  key,
  value
FROM
  settings
WHERE
  key = ?;

-- name: GetAllSettings :many
SELECT
  key,
  value
FROM
  settings;

-- name: UpdateSetting :exec
UPDATE settings
SET
  value = ?
WHERE
  key = ?;

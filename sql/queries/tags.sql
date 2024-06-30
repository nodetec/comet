-- Tag Queries
-- name: CreateTag :one
INSERT INTO
  tags (name, color, icon, created_at)
VALUES
  (?, ?, ?, ?) RETURNING id,
  name,
  color,
  icon,
  created_at;

-- name: GetTag :one
SELECT
  id,
  name,
  color,
  icon,
  created_at
FROM
  tags
WHERE
  id = ?;

-- name: ListTags :many
SELECT
  id,
  name,
  color,
  icon,
  created_at
FROM
  tags;

-- name: UpdateTag :exec
UPDATE tags
SET
  name = ?,
  color = ?,
  icon = ?,
  created_at = ?
WHERE
  id = ?;

-- name: DeleteTag :exec
DELETE FROM tags
WHERE
  id = ?;

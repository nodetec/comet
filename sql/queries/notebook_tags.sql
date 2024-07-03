-- Notebook-Tag Junction Table Queries
-- name: AddTagToNotebook :exec
INSERT INTO
  notebook_tags (notebook_id, tag_id)
VALUES
  (?, ?);

-- name: GetTagsForNotebook :many
SELECT
  t.id,
  t.name,
  t.color,
  t.icon,
  t.created_at
FROM
  tags t
  JOIN notebook_tags nt ON t.id = nt.tag_id
WHERE
  nt.notebook_id = ?;

-- name: RemoveTagFromNotebook :exec
DELETE FROM notebook_tags
WHERE
  notebook_id = ?
  AND tag_id = ?;

-- name: CheckTagForNotebook :one
SELECT
  COUNT(*) > 0 AS is_associated
FROM
  notebook_tags
WHERE
  notebook_id = ?
  AND tag_id = ?;

-- name: RemoveAllTagsFromNotebook :exec
DELETE FROM notebook_tags
WHERE
  notebook_id = ?;

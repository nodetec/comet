-- Note Queries
-- name: CreateNote :one
INSERT INTO
  notes (
    status_id,
    notebook_id,
    content,
    title,
    created_at,
    modified_at,
    published_at,
    event_id
  )
VALUES
  (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id,
  status_id,
  notebook_id,
  content,
  title,
  created_at,
  modified_at,
  published_at,
  event_id;

-- name: GetNote :one
SELECT
  id,
  status_id,
  notebook_id,
  content,
  title,
  created_at,
  modified_at,
  published_at,
  event_id
FROM
  notes
WHERE
  id = ?;

-- name: UpdateNote :exec
UPDATE notes
SET
  status_id = ?,
  notebook_id = ?,
  content = ?,
  title = ?,
  modified_at = ?,
  published_at = ?,
  event_id = ?
WHERE
  id = ?;

-- name: DeleteNote :exec
DELETE FROM notes
WHERE
  id = ?;

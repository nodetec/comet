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

-- name: ListNotes :many
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
ORDER BY
  modified_at DESC
LIMIT
  ?
OFFSET
  ?;

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

-- name: ListNotesByNotebook :many
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
  (notebook_id = ? OR (? IS NULL AND notebook_id IS NULL))
ORDER BY
  modified_at DESC
LIMIT
  ?
OFFSET
  ?;

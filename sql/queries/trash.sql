-- Trashed Note Queries
-- name: AddNoteToTrash :one
INSERT INTO
  trash (
    note_id,
    content,
    title,
    created_at,
    modified_at,
    tags
  )
VALUES
  (?, ?, ?, ?, ?, ?) RETURNING id,
  note_id,
  content,
  title,
  created_at,
  modified_at,
  tags;

-- name: GetNoteFromTrash :one
SELECT
  id,
  note_id,
  content,
  title,
  created_at,
  modified_at,
  tags
FROM
  trash
WHERE
  id = ?;

-- name: ListNotesFromTrash :many
SELECT
  id,
  note_id,
  content,
  title,
  created_at,
  modified_at,
  tags
FROM
  trash
LIMIT
  ?
OFFSET
  ?;

-- name: DeleteNoteFromTrash :exec
DELETE FROM trash
WHERE
  id = ?;

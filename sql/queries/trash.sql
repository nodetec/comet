-- Trashed Note Queries
-- name: AddNoteToTrash :one
INSERT INTO
  trash (
    note_id,
    content,
    title,
    created_at,
    modified_at,
    tags,
    notebook_id,
    published_at,
    event_id,
    notetype,
    filetype
  )
VALUES
  (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id,
  note_id,
  content,
  title,
  created_at,
  modified_at,
  tags,
  notebook_id,
  published_at,
  event_id,
  notetype,
  filetype;

-- name: GetNoteFromTrash :one
SELECT
  id,
  note_id,
  content,
  title,
  created_at,
  modified_at,
  tags,
  notebook_id,
  published_at,
  event_id,
  notetype,
  filetype
FROM
  trash
WHERE
  id = ?;

-- name: DeleteNoteFromTrash :exec
DELETE FROM trash
WHERE
  id = ?;

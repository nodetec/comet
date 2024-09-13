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
    event_id,
    pinned,
    notetype,
    filetype
  )
VALUES
  (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id,
  status_id,
  notebook_id,
  content,
  title,
  created_at,
  modified_at,
  published_at,
  event_id,
  pinned,
  notetype,
  filetype;

-- name: CreateNoteFromTrash :one
INSERT INTO
  notes (
    id,
    status_id,
    notebook_id,
    content,
    title,
    created_at,
    modified_at,
    published_at,
    event_id,
    pinned,
    notetype,
    filetype
  )
VALUES
  (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id,
  id,
  status_id,
  notebook_id,
  content,
  title,
  created_at,
  modified_at,
  published_at,
  event_id,
  pinned,
  notetype,
  filetype;

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
  event_id,
  pinned,
  notetype,
  filetype
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
  event_id = ?,
  pinned = ?,
  notetype = ?,
  filetype = ?
WHERE
  id = ?;

-- name: DeleteNote :exec
DELETE FROM notes
WHERE
  id = ?;

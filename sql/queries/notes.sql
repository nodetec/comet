-- Note Queries

-- name: CreateNote :one
INSERT INTO notes (status_id, notebook_id, content, title, created_at, modified_at, published_at, published_id)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
RETURNING id, status_id, notebook_id, content, title, created_at, modified_at, published_at, published_id;

-- name: GetNote :one
SELECT id, status_id, notebook_id, content, title, created_at, modified_at, published_at, published_id
FROM notes
WHERE id = ?;

-- name: ListNotes :many
SELECT id, status_id, notebook_id, content, title, created_at, modified_at, published_at, published_id
FROM notes;

-- name: UpdateNote :exec
UPDATE notes
SET status_id = ?, notebook_id = ?, content = ?, title = ?, modified_at = ?, published_at = ?, published_id = ?
WHERE id = ?;

-- name: DeleteNote :exec
DELETE FROM notes WHERE id = ?;

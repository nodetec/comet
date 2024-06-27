-- Trashed Note Queries

-- name: TrashNote :exec
INSERT INTO trashed_notes (note_id, content, created_at, trashed_at)
VALUES (?, ?, ?, ?)
RETURNING id, note_id, content, created_at, trashed_at;

-- name: GetTrashedNote :one
SELECT id, note_id, content, created_at, trashed_at
FROM trashed_notes
WHERE id = ?;

-- name: ListTrashedNotes :many
SELECT id, note_id, content, created_at, trashed_at
FROM trashed_notes;

-- name: DeleteTrashedNote :exec
DELETE FROM trashed_notes WHERE id = ?;


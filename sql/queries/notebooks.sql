-- Notebook Queries

-- name: CreateNotebook :one
INSERT INTO notebooks (name, created_at)
VALUES (?, ?)
RETURNING id, name, created_at;

-- name: GetNotebook :one
SELECT id, name, created_at
FROM notebooks
WHERE id = ?;

-- name: ListNotebooks :many
SELECT id, name, created_at
FROM notebooks;

-- name: UpdateNotebook :exec
UPDATE notebooks
SET name = ?, created_at = ?
WHERE id = ?;

-- name: DeleteNotebook :exec
DELETE FROM notebooks WHERE id = ?;


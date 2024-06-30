-- Note-Tag Junction Table Queries

-- name: AddTagToNote :exec
INSERT INTO note_tags (note_id, tag_id) VALUES (?, ?);

-- name: GetTagsForNote :many
SELECT t.id, t.name, t.color, t.icon, t.created_at
FROM tags t
JOIN note_tags nt ON t.id = nt.tag_id
WHERE nt.note_id = ?;

-- name: GetNotesForTag :many
SELECT n.id, n.status_id, n.notebook_id, n.content, n.title, n.created_at, n.modified_at, n.published_at, n.event_id
FROM notes n
JOIN note_tags nt ON n.id = nt.note_id
WHERE nt.tag_id = ?
LIMIT ? OFFSET ?;

-- name: RemoveTagFromNote :exec
DELETE FROM note_tags WHERE note_id = ? AND tag_id = ?;

-- name: CheckTagForNote :one
SELECT COUNT(*) > 0 AS is_associated
FROM note_tags
WHERE note_id = ? AND tag_id = ?;

// Code generated by sqlc. DO NOT EDIT.
// versions:
//   sqlc v1.26.0
// source: notes.sql

package db

import (
	"context"
	"database/sql"
)

const createNote = `-- name: CreateNote :one
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
  event_id
`

type CreateNoteParams struct {
	StatusID    sql.NullInt64
	NotebookID  int64
	Content     string
	Title       string
	CreatedAt   string
	ModifiedAt  string
	PublishedAt sql.NullString
	EventID     sql.NullString
}

// Note Queries
func (q *Queries) CreateNote(ctx context.Context, arg CreateNoteParams) (Note, error) {
	row := q.db.QueryRowContext(ctx, createNote,
		arg.StatusID,
		arg.NotebookID,
		arg.Content,
		arg.Title,
		arg.CreatedAt,
		arg.ModifiedAt,
		arg.PublishedAt,
		arg.EventID,
	)
	var i Note
	err := row.Scan(
		&i.ID,
		&i.StatusID,
		&i.NotebookID,
		&i.Content,
		&i.Title,
		&i.CreatedAt,
		&i.ModifiedAt,
		&i.PublishedAt,
		&i.EventID,
	)
	return i, err
}

const deleteNote = `-- name: DeleteNote :exec
DELETE FROM notes
WHERE
  id = ?
`

func (q *Queries) DeleteNote(ctx context.Context, id int64) error {
	_, err := q.db.ExecContext(ctx, deleteNote, id)
	return err
}

const getNote = `-- name: GetNote :one
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
  id = ?
`

func (q *Queries) GetNote(ctx context.Context, id int64) (Note, error) {
	row := q.db.QueryRowContext(ctx, getNote, id)
	var i Note
	err := row.Scan(
		&i.ID,
		&i.StatusID,
		&i.NotebookID,
		&i.Content,
		&i.Title,
		&i.CreatedAt,
		&i.ModifiedAt,
		&i.PublishedAt,
		&i.EventID,
	)
	return i, err
}

const listAllNotes = `-- name: ListAllNotes :many
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
  ?
`

type ListAllNotesParams struct {
	Limit  int64
	Offset int64
}

func (q *Queries) ListAllNotes(ctx context.Context, arg ListAllNotesParams) ([]Note, error) {
	rows, err := q.db.QueryContext(ctx, listAllNotes, arg.Limit, arg.Offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var items []Note
	for rows.Next() {
		var i Note
		if err := rows.Scan(
			&i.ID,
			&i.StatusID,
			&i.NotebookID,
			&i.Content,
			&i.Title,
			&i.CreatedAt,
			&i.ModifiedAt,
			&i.PublishedAt,
			&i.EventID,
		); err != nil {
			return nil, err
		}
		items = append(items, i)
	}
	if err := rows.Close(); err != nil {
		return nil, err
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return items, nil
}

const listNotesByNotebook = `-- name: ListNotesByNotebook :many
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
  (notebook_id = ?)
ORDER BY
  modified_at DESC
LIMIT
  ?
OFFSET
  ?
`

type ListNotesByNotebookParams struct {
	NotebookID int64
	Limit      int64
	Offset     int64
}

func (q *Queries) ListNotesByNotebook(ctx context.Context, arg ListNotesByNotebookParams) ([]Note, error) {
	rows, err := q.db.QueryContext(ctx, listNotesByNotebook, arg.NotebookID, arg.Limit, arg.Offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var items []Note
	for rows.Next() {
		var i Note
		if err := rows.Scan(
			&i.ID,
			&i.StatusID,
			&i.NotebookID,
			&i.Content,
			&i.Title,
			&i.CreatedAt,
			&i.ModifiedAt,
			&i.PublishedAt,
			&i.EventID,
		); err != nil {
			return nil, err
		}
		items = append(items, i)
	}
	if err := rows.Close(); err != nil {
		return nil, err
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return items, nil
}

const listNotesByNotebookAndTag = `-- name: ListNotesByNotebookAndTag :many
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
  notebook_id = ?
  AND id IN (
    SELECT
      note_id
    FROM
      note_tags
    WHERE
      tag_id = ?
  )
ORDER BY
  modified_at DESC
LIMIT
  ?
OFFSET
  ?
`

type ListNotesByNotebookAndTagParams struct {
	NotebookID int64
	TagID      sql.NullInt64
	Limit      int64
	Offset     int64
}

func (q *Queries) ListNotesByNotebookAndTag(ctx context.Context, arg ListNotesByNotebookAndTagParams) ([]Note, error) {
	rows, err := q.db.QueryContext(ctx, listNotesByNotebookAndTag,
		arg.NotebookID,
		arg.TagID,
		arg.Limit,
		arg.Offset,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var items []Note
	for rows.Next() {
		var i Note
		if err := rows.Scan(
			&i.ID,
			&i.StatusID,
			&i.NotebookID,
			&i.Content,
			&i.Title,
			&i.CreatedAt,
			&i.ModifiedAt,
			&i.PublishedAt,
			&i.EventID,
		); err != nil {
			return nil, err
		}
		items = append(items, i)
	}
	if err := rows.Close(); err != nil {
		return nil, err
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return items, nil
}

const updateNote = `-- name: UpdateNote :exec
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
  id = ?
`

type UpdateNoteParams struct {
	StatusID    sql.NullInt64
	NotebookID  int64
	Content     string
	Title       string
	ModifiedAt  string
	PublishedAt sql.NullString
	EventID     sql.NullString
	ID          int64
}

func (q *Queries) UpdateNote(ctx context.Context, arg UpdateNoteParams) error {
	_, err := q.db.ExecContext(ctx, updateNote,
		arg.StatusID,
		arg.NotebookID,
		arg.Content,
		arg.Title,
		arg.ModifiedAt,
		arg.PublishedAt,
		arg.EventID,
		arg.ID,
	)
	return err
}

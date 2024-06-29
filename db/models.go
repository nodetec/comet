// Code generated by sqlc. DO NOT EDIT.
// versions:
//   sqlc v1.26.0

package db

import (
	"database/sql"
)

type Note struct {
	ID          int64
	StatusID    sql.NullInt64
	NotebookID  sql.NullInt64
	Content     string
	Title       string
	CreatedAt   string
	ModifiedAt  string
	PublishedAt sql.NullString
	EventID     sql.NullString
}

type NoteTag struct {
	NoteID sql.NullInt64
	TagID  sql.NullInt64
}

type Notebook struct {
	ID        int64
	Name      string
	CreatedAt string
}

type NotesFt struct {
	Content    string
	NotebookID string
	CreatedAt  string
	ModifiedAt string
}

type Setting struct {
	Key   string
	Value sql.NullString
}

type Tag struct {
	ID        int64
	Name      string
	Color     sql.NullString
	Icon      sql.NullString
	CreatedAt string
}

type TrashedNote struct {
	ID        int64
	NoteID    sql.NullInt64
	Content   string
	CreatedAt string
	TrashedAt string
}
package models

// NotebookTag represents a junction between a notebook and a tag
type NotebookTag struct {
	NotebookID int `db:"notebook_id"`
	TagID      int `db:"tag_id"`
}

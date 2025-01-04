package models

// NoteTag represents a junction between a note and a tag
type NoteTag struct {
	NoteID int `db:"note_id"`
	TagID  int `db:"tag_id"`
}

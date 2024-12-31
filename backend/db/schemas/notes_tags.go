package schemas

// NotesTagsTableSchema defines the schema for the notes_tags junction table
const NotesTagsTableSchema = `
CREATE TABLE IF NOT EXISTS notes_tags (
    note_id INTEGER NOT NULL,
    tag_id INTEGER NOT NULL,
    PRIMARY KEY (note_id, tag_id),
    FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE,
    CHECK (note_id > 0),
    CHECK (tag_id > 0)
);

CREATE INDEX IF NOT EXISTS idx_note_id ON notes_tags(note_id);
CREATE INDEX IF NOT EXISTS idx_tag_id ON notes_tags(tag_id);`

// NoteTag represents a junction between a note and a tag
type NoteTag struct {
	NoteID int `db:"note_id"`
	TagID  int `db:"tag_id"`
}

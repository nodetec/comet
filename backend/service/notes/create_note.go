package notes

import (
	"comet/backend/db"
	"comet/backend/db/schemas"
	"database/sql"
	"log"
	"strings"
)

// CreateNote inserts a new note into the database and returns the created note
func CreateNote(title, content string) (*schemas.Note, error) {
	// Directly clear all active notes
	_, err := db.DB.Exec("UPDATE notes SET active = FALSE WHERE active = TRUE")
	if err != nil {
		log.Printf("Failed to clear active notes: %v", err)
		return nil, err
	}

	var notebookID *int
	err = db.DB.Get(&notebookID, "SELECT id FROM notebooks WHERE active = true LIMIT 1")
	if err != nil && err != sql.ErrNoRows {
		log.Printf("Failed to get active notebook: %v", err)
		return nil, err
	}

	// Check if there are any active tags
	var activeTags []schemas.Tag
	err = db.DB.Select(&activeTags, "SELECT * FROM tags WHERE active = 1")
	if err != nil {
		log.Printf("Failed to retrieve active tags: %v", err)
		return nil, err
	}

	// If there are active tags, modify the content to include them on the second line
	if len(activeTags) > 0 {
		var tags []string
		for _, tag := range activeTags {
			tags = append(tags, "#"+tag.Name)
		}
		tagsLine := strings.Join(tags, " ")
		content = content + "\n" + tagsLine
	}

	var result sql.Result
	if notebookID != nil {
		result, err = db.DB.Exec("INSERT INTO notes (title, content, notebook_id) VALUES (?, ?, ?)", title, content, notebookID)
	} else {
		result, err = db.DB.Exec("INSERT INTO notes (title, content) VALUES (?, ?)", title, content)
	}
	if err != nil {
		log.Printf("Failed to create note: %v", err)
		return nil, err
	}

	id, err := result.LastInsertId()
	if err != nil {
		log.Printf("Failed to retrieve last insert ID: %v", err)
		return nil, err
	}

	var note schemas.Note
	err = db.DB.Get(&note, "SELECT * FROM notes WHERE id = ?", id)
	if err != nil {
		log.Printf("Failed to retrieve created note: %v", err)
		return nil, err
	}

	// Associate the note with active tags
	if len(activeTags) > 0 {
		stmtNoteTag, err := db.DB.Prepare("INSERT OR IGNORE INTO notes_tags (note_id, tag_id) VALUES (?, ?)")
		if err != nil {
			log.Printf("Failed to prepare note-tag association statement: %v", err)
			return nil, err
		}
		defer stmtNoteTag.Close()

		for _, tag := range activeTags {
			_, err = stmtNoteTag.Exec(id, tag.ID)
			if err != nil {
				log.Printf("Failed to associate tag with note: %v", err)
				return nil, err
			}
		}
	}

	return &note, nil
}

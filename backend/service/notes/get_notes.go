package notes

import (
	"comet/backend/db"
	"comet/backend/db/schemas"
	"database/sql"
	"fmt"
	"log"
)

// GetNotes retrieves all notes from the database with specified ordering, limit, offset, search, and trashed filter
func GetNotes(orderBy string, orderDirection string, limit int, offset int, search string, showTrashed bool) ([]schemas.Note, error) {
	var notes []schemas.Note
	var activeTags []schemas.Tag
	var activeNotebookID *int

	// Check if there are any active tags
	activeTagsQuery := "SELECT * FROM tags WHERE active = 1"
	err := db.DB.Select(&activeTags, activeTagsQuery)
	if err != nil {
		log.Printf("Failed to retrieve active tags: %v", err)
		return nil, err
	}

	// Check if there is an active notebook
	err = db.DB.Get(&activeNotebookID, "SELECT id FROM notebooks WHERE active = true LIMIT 1")
	if err != nil && err != sql.ErrNoRows {
		log.Printf("Failed to get active notebook: %v", err)
		return nil, err
	}

	// If there are active tags, filter and only show notes associated with those active tags
	if len(activeTags) > 0 {
		log.Printf("Active tags found, filtering notes by active tags")
		query := fmt.Sprintf(`
			SELECT DISTINCT notes.*, notes.active FROM notes
			JOIN notes_tags ON notes.id = notes_tags.note_id
			JOIN tags ON notes_tags.tag_id = tags.id
			WHERE tags.active = 1 AND notes.content LIKE '%%%s%%'`, search)
		if activeNotebookID != nil {
			query += fmt.Sprintf(" AND notes.notebook_id = %d", *activeNotebookID)
		}
		if showTrashed {
			query += " AND notes.trashed_at IS NOT NULL"
		} else {
			query += " AND notes.trashed_at IS NULL"
		}
		query += fmt.Sprintf(" ORDER BY %s %s LIMIT %d OFFSET %d", orderBy, orderDirection, limit, offset)
		err = db.DB.Select(&notes, query)
		if err != nil {
			log.Printf("Failed to retrieve notes: %v", err)
			return nil, err
		}
	} else {
		// If there are no active tags, retrieve all notes
		query := fmt.Sprintf("SELECT *, active FROM notes WHERE content LIKE '%%%s%%'", search)
		if activeNotebookID != nil {
			query += fmt.Sprintf(" AND notebook_id = %d", *activeNotebookID)
		}
		if showTrashed {
			query += " AND trashed_at IS NOT NULL"
		} else {
			query += " AND trashed_at IS NULL"
		}
		query += fmt.Sprintf(" ORDER BY %s %s LIMIT %d OFFSET %d", orderBy, orderDirection, limit, offset)
		err = db.DB.Select(&notes, query)
		if err != nil {
			log.Printf("Failed to retrieve notes: %v", err)
			return nil, err
		}
	}

	log.Printf("Retrieved %d notes", len(notes))

	return notes, nil
}

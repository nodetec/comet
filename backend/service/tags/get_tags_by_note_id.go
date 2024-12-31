package tags

import (
	"comet/backend/db"
	"comet/backend/db/schemas"
	"log"
)

// GetTagsByNoteID retrieves all tags associated with a specific note ID
func GetTagsByNoteID(noteID int) ([]schemas.Tag, error) {
	var tags []schemas.Tag
	query := `
		SELECT tags.* FROM tags
		JOIN notes_tags ON tags.id = notes_tags.tag_id
		WHERE notes_tags.note_id = ?
		ORDER BY tags.name ASC`
	err := db.DB.Select(&tags, query, noteID)
	if err != nil {
		log.Printf("Failed to retrieve tags for note ID %d: %v", noteID, err)
		return nil, err
	}
	return tags, nil
}

package notes

import (
	"comet/backend/db"
	"comet/backend/models"
	"log"
)

// UpdateNote updates the content and title of an existing note
func UpdateNote(note models.Note) error {
	var existingContent string
	err := db.DB.Get(&existingContent, "SELECT content FROM notes WHERE id = ?", note.ID)
	if err != nil {
		log.Printf("Failed to retrieve existing note content: %v", err)
		return err
	}

	query := `UPDATE notes SET title = ?, content = ?, modified_at = strftime('%Y-%m-%d %H:%M:%f', 'now')`
	if existingContent != note.Content {
		query += `, content_modified_at = strftime('%Y-%m-%d %H:%M:%f', 'now')`
	}
	query += ` WHERE id = ?`

	_, err = db.DB.Exec(query, note.Title, note.Content, note.ID)
	if err != nil {
		log.Printf("Failed to update note: %v", err)
		return err
	}
	return nil
}

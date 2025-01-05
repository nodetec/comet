package notes

import (
	"comet/backend/db"
	"comet/backend/models"
	"log"
)

// UpdateNote updates the content, title, and notebook ID of an existing note
func UpdateNote(note models.Note) error {
	var existingContent string
	err := db.DB.Get(&existingContent, "SELECT content FROM notes WHERE id = ?", note.ID)
	if err != nil {
		log.Printf("Failed to retrieve existing note content: %v", err)
		return err
	}

	query := `UPDATE notes SET title = ?, content = ?, notebook_id = ?, modified_at = strftime('%Y-%m-%d %H:%M:%f', 'now')`
	if existingContent != note.Content {
		query += `, content_modified_at = strftime('%Y-%m-%d %H:%M:%f', 'now')`
	}
	query += ` WHERE id = ?`

	_, err = db.DB.Exec(query, note.Title, note.Content, note.NotebookID, note.ID)
	if err != nil {
		log.Printf("Failed to update note: %v", err)
		return err
	}
	return nil
}

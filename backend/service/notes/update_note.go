package notes

import (
	"comet/backend/db"
	"comet/backend/db/schemas"
	"log"
)

// UpdateNote updates the content and title of an existing note
func UpdateNote(note schemas.Note) error {
	_, err := db.DB.Exec("UPDATE notes SET title = ?, content = ?, modified_at = CURRENT_TIMESTAMP WHERE id = ?", note.Title, note.Content, note.ID)
	if err != nil {
		log.Printf("Failed to update note: %v", err)
		return err
	}
	return nil
}

package notes

import (
	"comet/backend/db"
	"log"
)

// SetPublishDetails updates the author, identifier, and published_at fields of a note
func SetPublishDetails(noteID int, author, identifier string) error {
	_, err := db.DB.Exec("UPDATE notes SET author = ?, identifier = ?, published_at = CURRENT_TIMESTAMP WHERE id = ?", author, identifier, noteID)
	if err != nil {
		log.Printf("Failed to set publish details for note %d: %v", noteID, err)
		return err
	}
	return nil
}

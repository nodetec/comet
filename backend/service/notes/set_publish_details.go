package notes

import (
	"comet/backend/db"
	"log"
)

// SetPublishDetails updates the author, identifier, and published_at fields of a note
func SetPublishDetails(noteID int, author, identifier, publishedAt string) error {
	if publishedAt == "" {
		publishedAt = "CURRENT_TIMESTAMP"
	}
	_, err := db.DB.Exec("UPDATE notes SET author = ?, identifier = ?, published_at = ? WHERE id = ?", author, identifier, publishedAt, noteID)
	if err != nil {
		log.Printf("Failed to set publish details for note %d: %v", noteID, err)
		return err
	}
	return nil
}

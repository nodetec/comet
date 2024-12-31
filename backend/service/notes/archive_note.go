package notes

import (
	"comet/backend/db"
	"log"
)

// ArchiveNote archives a note by its ID
func ArchiveNote(id int) error {
	_, err := db.DB.Exec("UPDATE notes SET archived_at = CURRENT_TIMESTAMP WHERE id = ?", id)
	if err != nil {
		log.Printf("Failed to archive note: %v", err)
		return err
	}
	return nil
}

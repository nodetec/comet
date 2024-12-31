package notes

import (
	"comet/backend/db"
	"log"
)

// UnarchiveNote unarchives a note by its ID
func UnarchiveNote(id int) error {
	_, err := db.DB.Exec("UPDATE notes SET archived_at = NULL WHERE id = ?", id)
	if err != nil {
		log.Printf("Failed to unarchive note: %v", err)
		return err
	}
	return nil
}

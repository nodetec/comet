package notes

import (
	"comet/backend/db"
	"log"
)

// ClearActiveNote deactivates all active notes
func ClearActiveNote() error {
	// Deactivate all notes
	_, err := db.DB.Exec("UPDATE notes SET active = FALSE WHERE active = TRUE")
	if err != nil {
		log.Printf("Failed to clear active notes: %v", err)
		return err
	}

	return nil
}

package notes

import (
	"comet/backend/db"
	"log"
)

// PinNote pins a note by its ID
func PinNote(id int) error {
	_, err := db.DB.Exec("UPDATE notes SET pinned = 1 WHERE id = ?", id)
	if err != nil {
		log.Printf("Failed to pin note: %v", err)
		return err
	}
	return nil
}

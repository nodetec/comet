package relays

import (
	"comet/backend/db"
	"log"
)

// DeleteRelay deletes a relay by its ID
func DeleteRelay(id int) error {
	_, err := db.DB.Exec("DELETE FROM relays WHERE id = ?", id)
	if err != nil {
		log.Printf("Failed to delete relay: %v", err)
		return err
	}
	return nil
}

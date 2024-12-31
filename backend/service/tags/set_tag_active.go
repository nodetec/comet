package tags

import (
	"comet/backend/db"
	"log"
)

// SetTagActive sets the active status of a tag
func SetTagActive(tagID int, active bool) error {
	_, err := db.DB.Exec("UPDATE tags SET active = ? WHERE id = ?", active, tagID)
	if err != nil {
		log.Printf("Failed to set tag active status: %v", err)
		return err
	}
	return nil
}

package tags

import (
	"comet/backend/db"
	"log"
)

// SetTagInactive sets the active status of a tag to false
func SetTagInactive(tagID int) error {
	_, err := db.DB.Exec("UPDATE tags SET active = 0 WHERE id = ?", tagID)
	if err != nil {
		log.Printf("Failed to set tag inactive: %v", err)
		return err
	}
	return nil
}

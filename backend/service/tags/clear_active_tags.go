package tags

import (
	"comet/backend/db"
	"log"
)

// SetAllTagsInactive sets the active status of all tags to false
func ClearActiveTags() error {
	_, err := db.DB.Exec("UPDATE tags SET active = 0")
	if err != nil {
		log.Printf("Failed to set all tags inactive: %v", err)
		return err
	}
	return nil
}

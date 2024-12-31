package tags

import (
	"comet/backend/db"
	"log"
)

// DeleteTag deletes a tag by its ID
func DeleteTag(id int) error {
	_, err := db.DB.Exec("DELETE FROM tags WHERE id = ?", id)
	if err != nil {
		log.Printf("Failed to delete tag: %v", err)
		return err
	}
	return nil
}

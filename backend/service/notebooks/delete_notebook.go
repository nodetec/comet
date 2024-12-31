package notebooks

import (
	"comet/backend/db"
	"log"
)

// DeleteNotebook deletes a notebook by its ID
func DeleteNotebook(id int) error {
	_, err := db.DB.Exec("DELETE FROM notebooks WHERE id = ?", id)
	if err != nil {
		log.Printf("Failed to delete notebook: %v", err)
		return err
	}
	return nil
}

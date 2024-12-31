package notes

import (
	"comet/backend/db"
	"log"
)

// DeleteNote deletes a note by its ID
func DeleteNote(id int) error {
	_, err := db.DB.Exec("DELETE FROM notes WHERE id = ?", id)
	if err != nil {
		log.Printf("Failed to delete note: %v", err)
		return err
	}
	return nil
}

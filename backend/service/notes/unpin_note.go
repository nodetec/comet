package notes

import (
	"comet/backend/db"
	"log"
)

// UnpinNote unpins a note by its ID
func UnpinNote(id int) error {
	_, err := db.DB.Exec("UPDATE notes SET pinned = 0 WHERE id = ?", id)
	if err != nil {
		log.Printf("Failed to unpin note: %v", err)
		return err
	}
	return nil
}

package notebooks

import (
	"comet/backend/db"
	"log"
)

// HideNotebook sets the pinned_at to NULL to hide the notebook
func HideNotebook(notebookID int) error {
	_, err := db.DB.Exec("UPDATE notebooks SET pinned_at = NULL WHERE id = ?", notebookID)
	if err != nil {
		log.Printf("Failed to hide notebook: %v", err)
		return err
	}
	return nil
}

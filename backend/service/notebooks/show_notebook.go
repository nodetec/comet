package notebooks

import (
	"comet/backend/db"
	"log"
)

// ShowNotebook sets the pinned_at to the current timestamp to show the notebook
func ShowNotebook(notebookID int) error {
	_, err := db.DB.Exec("UPDATE notebooks SET pinned_at = strftime('%Y-%m-%d %H:%M:%f', 'now') WHERE id = ?", notebookID)
	if err != nil {
		log.Printf("Failed to show notebook: %v", err)
		return err
	}
	return nil
}

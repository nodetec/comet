package sort

import (
	"comet/backend/db"
	"log"
)

func UpdateSortPreference(notebookID int, sortBy, sortOrder string) error {
	query := `
		INSERT INTO sort_preferences (notebook_id, sort_by, sort_order)
		VALUES (?, ?, ?)
		ON CONFLICT(notebook_id) DO UPDATE SET
		sort_by = excluded.sort_by,
		sort_order = excluded.sort_order
	`
	_, err := db.DB.Exec(query, notebookID, sortBy, sortOrder)
	if err != nil {
		log.Printf("Failed to update sort preference: %v", err)
		return err
	}

	return nil
}

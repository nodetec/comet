package sort

import (
	"database/sql"
)

func UpdateSortPreference(db *sql.DB, notebookID int, sortBy, sortOrder string) error {
	query := `
		INSERT INTO sort_preferences (notebook_id, sort_by, sort_order)
		VALUES (?, ?, ?)
		ON CONFLICT(notebook_id) DO UPDATE SET
		sort_by = excluded.sort_by,
		sort_order = excluded.sort_order
	`
	_, err := db.Exec(query, notebookID, sortBy, sortOrder)
	if err != nil {
		return err
	}

	return nil
}

package sort

import (
	"comet/backend/models"
	"database/sql"
)

func CreateSortPreference(db *sql.DB, notebookID int, sortBy, sortOrder string) (*models.SortPreference, error) {
	query := `
		INSERT INTO sort_preferences (notebook_id, sort_by, sort_order)
		VALUES (?, ?, ?)
		RETURNING id, notebook_id, sort_by, sort_order
	`
	row := db.QueryRow(query, notebookID, sortBy, sortOrder)

	var pref models.SortPreference
	err := row.Scan(&pref.ID, &pref.NotebookID, &pref.SortBy, &pref.SortOrder)
	if err != nil {
		return nil, err
	}

	return &pref, nil
}

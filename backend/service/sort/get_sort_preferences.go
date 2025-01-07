package sort

import (
	"comet/backend/models"
	"database/sql"
)

func GetSortPreference(db *sql.DB, notebookID *int) (*models.SortPreference, error) {
	var query string
	var row *sql.Row

	if notebookID == nil {
		query = "SELECT id, notebook_id, sort_by, sort_order FROM sort_preferences WHERE notebook_id IS NULL LIMIT 1"
		row = db.QueryRow(query)
	} else {
		query = "SELECT id, notebook_id, sort_by, sort_order FROM sort_preferences WHERE notebook_id = ? LIMIT 1"
		row = db.QueryRow(query, *notebookID)
	}

	var pref models.SortPreference
	err := row.Scan(&pref.ID, &pref.NotebookID, &pref.SortBy, &pref.SortOrder)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}

	return &pref, nil
}

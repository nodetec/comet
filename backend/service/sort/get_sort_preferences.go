package sort

import (
	"comet/backend/db"
	"comet/backend/models"
	"database/sql"
	"log"
)

func GetSortPreference() (*models.SortPreference, error) {
	// Get the active notebook ID
	var notebookID sql.NullInt32
	err := db.DB.QueryRow("SELECT id FROM notebooks WHERE active = true LIMIT 1").Scan(&notebookID)
	if err != nil && err != sql.ErrNoRows {
		return nil, err
	}

	// Get the current sort preference
	var query string
	var row *sql.Row

	if !notebookID.Valid {
		log.Println("No active notebook found, retrieving global sort preference")
		query = "SELECT id, notebook_id, sort_by, sort_order FROM sort_preferences WHERE notebook_id IS NULL LIMIT 1"
		row = db.DB.QueryRow(query)
	} else {
		log.Printf("Active notebook found, retrieving notebook-specific sort preference")
		query = "SELECT id, notebook_id, sort_by, sort_order FROM sort_preferences WHERE notebook_id = ? LIMIT 1"
		row = db.DB.QueryRow(query, notebookID.Int32)
	}

	var pref models.SortPreference
	log.Println("Query:", query)
	err = row.Scan(&pref.ID, &pref.NotebookID, &pref.SortBy, &pref.SortOrder)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}

	return &pref, nil
}

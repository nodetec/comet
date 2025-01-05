package notebooks

import (
	"comet/backend/db"
	"comet/backend/models"
	"log"
)

// GetNotebooks retrieves all notebooks from the database
func GetNotebooks(pinned bool) ([]models.Notebook, error) {
	query := "SELECT id, name, created_at, modified_at, pinned_at, display_order, active FROM notebooks"
	if pinned {
		query += " WHERE pinned_at IS NOT NULL"
	}
	query += " ORDER BY name ASC"

	rows, err := db.DB.Query(query)
	if err != nil {
		log.Printf("Failed to get notebooks: %v", err)
		return nil, err
	}
	defer rows.Close()

	var notebooks []models.Notebook
	for rows.Next() {
		var notebook models.Notebook
		if err := rows.Scan(&notebook.ID, &notebook.Name, &notebook.CreatedAt, &notebook.ModifiedAt, &notebook.PinnedAt, &notebook.DisplayOrder, &notebook.Active); err != nil {
			log.Printf("Failed to scan notebook: %v", err)
			return nil, err
		}
		notebooks = append(notebooks, notebook)
	}
	return notebooks, nil
}

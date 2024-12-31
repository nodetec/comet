package notebooks

import (
	"comet/backend/db"
	"comet/backend/db/schemas"
	"log"
)

// GetNotebooks retrieves all notebooks from the database
func GetNotebooks(pinned bool) ([]schemas.Notebook, error) {
	query := "SELECT id, name, created_at, modified_at, pinned, active FROM notebooks"
	if pinned {
		query += " WHERE pinned = true"
	}

	rows, err := db.DB.Query(query)
	if err != nil {
		log.Printf("Failed to get notebooks: %v", err)
		return nil, err
	}
	defer rows.Close()

	var notebooks []schemas.Notebook
	for rows.Next() {
		var notebook schemas.Notebook
		if err := rows.Scan(&notebook.ID, &notebook.Name, &notebook.CreatedAt, &notebook.ModifiedAt, &notebook.Pinned, &notebook.Active); err != nil {
			log.Printf("Failed to scan notebook: %v", err)
			return nil, err
		}
		notebooks = append(notebooks, notebook)
	}
	return notebooks, nil
}

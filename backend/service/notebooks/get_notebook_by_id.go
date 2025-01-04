package notebooks

import (
	"comet/backend/db"
	"comet/backend/models"
	"database/sql"
	"log"
)

// GetNotebookByID retrieves a single notebook by its ID
func GetNotebookByID(id int) (*models.Notebook, error) {
	var notebook models.Notebook
	err := db.DB.QueryRow("SELECT id, name, created_at, modified_at, active FROM notebooks WHERE id = ?", id).Scan(&notebook.ID, &notebook.Name, &notebook.CreatedAt, &notebook.ModifiedAt, &notebook.Active)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		log.Printf("Failed to get notebook by ID: %v", err)
		return nil, err
	}
	return &notebook, nil
}

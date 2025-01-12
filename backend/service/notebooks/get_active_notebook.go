package notebooks

import (
	"comet/backend/db"
	"comet/backend/models"
	"database/sql"
	"log"
)

// GetActiveNotebook retrieves the active notebook from the database
func GetActiveNotebook() (*models.Notebook, error) {
	var notebook models.Notebook
	err := db.DB.Get(&notebook, "SELECT id, name, created_at, modified_at, active FROM notebooks WHERE active = true LIMIT 1")
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, err
		}
		log.Printf("Failed to get active notebook: %v", err)
		return nil, err
	}
	return &notebook, nil
}

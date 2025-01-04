package notebooks

import (
	"comet/backend/db"
	"comet/backend/models"
	"log"
)

// GetActiveNotebook retrieves the active notebook from the database
func GetActiveNotebook() (*models.Notebook, error) {
	var notebook models.Notebook
	err := db.DB.Get(&notebook, "SELECT id, name, created_at, modified_at, pinned, active FROM notebooks WHERE active = true LIMIT 1")
	if err != nil {
		log.Printf("Failed to get active notebook: %v", err)
		return nil, err
	}
	return &notebook, nil
}

package notebooks

import (
	"comet/backend/db"
	"comet/backend/db/schemas"
	"log"
)

// GetActiveNotebook retrieves the active notebook from the database
func GetActiveNotebook() (*schemas.Notebook, error) {
	var notebook schemas.Notebook
	err := db.DB.Get(&notebook, "SELECT id, name, created_at, modified_at, pinned, active FROM notebooks WHERE active = true LIMIT 1")
	if err != nil {
		log.Printf("Failed to get active notebook: %v", err)
		return nil, err
	}
	return &notebook, nil
}

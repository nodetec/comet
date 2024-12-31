package notebooks

import (
	"comet/backend/db"
	"log"
)

// CheckNotebookExists checks if a notebook with the given name already exists in the database
func CheckNotebookExists(name string) (bool, error) {
	var exists bool
	err := db.DB.QueryRow("SELECT EXISTS(SELECT 1 FROM notebooks WHERE name = ?)", name).Scan(&exists)
	if err != nil {
		log.Printf("Failed to check if notebook exists: %v", err)
		return false, err
	}
	return exists, nil
}

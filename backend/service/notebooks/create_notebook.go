package notebooks

import (
	"comet/backend/db"
	"log"
)

// CreateNotebook inserts a new notebook into the database
func CreateNotebook(name string, pinned bool) error {
	_, err := db.DB.Exec("INSERT INTO notebooks (name, pinned) VALUES (?, ?)", name, pinned)
	if err != nil {
		log.Printf("Failed to create notebook: %v", err)
		return err
	}
	return nil
}

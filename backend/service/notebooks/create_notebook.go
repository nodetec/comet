package notebooks

import (
	"comet/backend/db"
	"log"
)

// CreateNotebook inserts a new notebook into the database
func CreateNotebook(name string) error {
	_, err := db.DB.Exec("INSERT INTO notebooks (name, pinned_at, created_at, modified_at) VALUES (?, strftime('%Y-%m-%d %H:%M:%f', 'now'), strftime('%Y-%m-%d %H:%M:%f', 'now'), strftime('%Y-%m-%d %H:%M:%f', 'now'))", name)
	if err != nil {
		log.Printf("Failed to create notebook: %v", err)
		return err
	}
	return nil
}

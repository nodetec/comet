package tags

import (
	"comet/backend/db"
	"log"
)

// CreateTag inserts a new tag into the database
func CreateTag(name, color, icon string, active, inactive bool) error {
	_, err := db.DB.Exec("INSERT INTO tags (name, color, icon, active, inactive) VALUES (?, ?, ?, ?, ?)", name, color, icon, active, inactive)
	if err != nil {
		log.Printf("Failed to create tag: %v", err)
		return err
	}
	return nil
}

package notes

import (
	"comet/backend/db"
	"comet/backend/models"
	"log"
)

// GetActiveNote retrieves the active note from the database
func GetActiveNote() (*models.Note, error) {
	var note models.Note
	err := db.DB.Get(&note, "SELECT * FROM notes WHERE active = TRUE LIMIT 1")
	if err != nil {
		log.Printf("Failed to retrieve active note: %v", err)
		return nil, err
	}
	return &note, nil
}

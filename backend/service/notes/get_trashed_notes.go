package notes

import (
	"comet/backend/db"
	"comet/backend/db/schemas" // Correct import path to schemas
	"log"
)

// GetTrashedNotes retrieves all trashed notes from the database
func GetTrashedNotes() ([]schemas.Note, error) { // Use schemas.Note to refer to the imported struct
	var notes []schemas.Note
	err := db.DB.Select(&notes, "SELECT * FROM notes WHERE trashed_at IS NOT NULL ORDER BY trashed_at DESC")
	if err != nil {
		log.Printf("Failed to retrieve trashed notes: %v", err)
		return nil, err
	}
	return notes, nil
}

package notes

import (
	"comet/backend/db"
	"comet/backend/db/schemas" // Correct import path to schemas
	"log"
)

// GetPinnedNotes retrieves all pinned notes from the database
func GetPinnedNotes() ([]schemas.Note, error) { // Use schemas.Note to refer to the imported struct
	var notes []schemas.Note
	err := db.DB.Select(&notes, "SELECT * FROM notes WHERE pinned = 1 ORDER BY created_at DESC")
	if err != nil {
		log.Printf("Failed to retrieve pinned notes: %v", err)
		return nil, err
	}
	return notes, nil
}

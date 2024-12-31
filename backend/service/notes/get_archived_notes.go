package notes

import (
	"comet/backend/db"
	"comet/backend/db/schemas" // Correct import path to schemas
	"log"
)

// GetArchivedNotes retrieves all archived notes from the database
func GetArchivedNotes() ([]schemas.Note, error) { // Use schemas.Note to refer to the imported struct
	var notes []schemas.Note
	err := db.DB.Select(&notes, "SELECT * FROM notes WHERE archived_at IS NOT NULL ORDER BY archived_at DESC")
	if err != nil {
		log.Printf("Failed to retrieve archived notes: %v", err)
		return nil, err
	}
	return notes, nil
}

package notes

import (
	"comet/backend/db"
	"comet/backend/db/schemas" // Correct import path to schemas
	"log"
)

// SearchNotes searches for notes by content
func SearchNotes(query string) ([]schemas.Note, error) { // Use schemas.Note to refer to the imported struct
	var notes []schemas.Note
	err := db.DB.Select(&notes, "SELECT * FROM notes WHERE content LIKE ? ORDER BY created_at DESC", "%"+query+"%")
	if err != nil {
		log.Printf("Failed to search notes: %v", err)
		return nil, err
	}
	return notes, nil
}

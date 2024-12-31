package notes

import (
	"comet/backend/db"
	"comet/backend/db/schemas" // Correct import path to schemas
	"log"
)

// GetNoteByID retrieves a single note by its ID
func GetNoteByID(id int) (*schemas.Note, error) { // Use schemas.Note to refer to the imported struct
	var note schemas.Note
	err := db.DB.Get(&note, "SELECT * FROM notes WHERE id = ?", id)
	if err != nil {
		log.Printf("Failed to retrieve note: %v", err)
		return nil, err
	}
	return &note, nil
}

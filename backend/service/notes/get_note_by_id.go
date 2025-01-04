package notes

import (
	"comet/backend/db"
	"comet/backend/models"
	"log"
)

// GetNoteByID retrieves a single note by its ID
func GetNoteByID(id int) (*models.Note, error) { // Use schemas.Note to refer to the imported struct
	var note models.Note
	err := db.DB.Get(&note, "SELECT * FROM notes WHERE id = ?", id)
	if err != nil {
		log.Printf("Failed to retrieve note: %v", err)
		return nil, err
	}
	return &note, nil
}

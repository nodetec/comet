package notes

import (
	"comet/backend/db"
	"comet/backend/db/schemas" // Correct import path to schemas
	"log"
)

// GetNotesByNotebookID retrieves all notes by a specific notebook ID
func GetNotesByNotebookID(notebookID int) ([]schemas.Note, error) { // Use schemas.Note to refer to the imported struct
	var notes []schemas.Note
	err := db.DB.Select(&notes, "SELECT * FROM notes WHERE notebook_id = ? ORDER BY created_at DESC", notebookID)
	if err != nil {
		log.Printf("Failed to retrieve notes by notebook ID: %v", err)
		return nil, err
	}
	return notes, nil
}

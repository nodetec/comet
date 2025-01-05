package notes

import (
	"comet/backend/db"
	"comet/backend/models"
	"log"
)

// MoveNoteToNotebook updates the notebook ID of a note and manages tag associations
func MoveNoteToNotebook(note models.Note, notebookID int) error {
	// Remove all tag associations from the previous notebook if the note was the only note with those tags
	if note.NotebookID != nil {
		_, err := db.DB.Exec(`DELETE FROM notebook_tags WHERE notebook_id = ?`, *note.NotebookID)
		if err != nil {
			log.Printf("Failed to remove tag associations from previous notebook: %v", err)
			return err
		}

		// Remove the notebook ID from the note
		_, err = db.DB.Exec(`UPDATE notes SET notebook_id = NULL WHERE id = ?`, note.ID)
		if err != nil {
			log.Printf("Failed to remove notebook ID from note: %v", err)
			return err
		}

		// Get all tag associations for the notes associated with the previous notebook
		rows, err := db.DB.Query(`SELECT tag_id FROM notes_tags WHERE note_id IN (SELECT id FROM notes WHERE notebook_id = ?)`, *note.NotebookID)
		if err != nil {
			log.Printf("Failed to get tag associations for previous notebook: %v", err)
			return err
		}
		defer rows.Close()

		var tagIDs []int
		for rows.Next() {
			var tagID int
			if err := rows.Scan(&tagID); err != nil {
				log.Printf("Failed to scan tag ID: %v", err)
				return err
			}
			tagIDs = append(tagIDs, tagID)
		}
		if err := rows.Err(); err != nil {
			log.Printf("Failed to iterate over tag IDs: %v", err)
			return err
		}

		// Add those tag associations to the previous notebook
		for _, tagID := range tagIDs {
			_, err := db.DB.Exec(`INSERT INTO notebook_tags (notebook_id, tag_id) VALUES (?, ?)`, *note.NotebookID, tagID)
			if err != nil {
				log.Printf("Failed to add tag association to previous notebook: %v", err)
				return err
			}
		}
	}

	// Add the new notebook ID to the note
	_, err := db.DB.Exec(`UPDATE notes SET notebook_id = ? WHERE id = ?`, notebookID, note.ID)
	if err != nil {
		log.Printf("Failed to add new notebook ID to note: %v", err)
		return err
	}

	// Get the tags associated with the note
	rows, err := db.DB.Query(`SELECT tag_id FROM notes_tags WHERE note_id = ?`, note.ID)
	if err != nil {
		log.Printf("Failed to get tags associated with the note: %v", err)
		return err
	}
	defer rows.Close()

	var tagIDs []int
	for rows.Next() {
		var tagID int
		if err := rows.Scan(&tagID); err != nil {
			log.Printf("Failed to scan tag ID: %v", err)
			return err
		}
		tagIDs = append(tagIDs, tagID)
	}
	if err := rows.Err(); err != nil {
		log.Printf("Failed to iterate over tag IDs: %v", err)
		return err
	}

	// Add those tag associations to the new notebook if they don't already exist
	for _, tagID := range tagIDs {
		_, err := db.DB.Exec(`INSERT OR IGNORE INTO notebook_tags (notebook_id, tag_id) VALUES (?, ?)`, notebookID, tagID)
		if err != nil {
			log.Printf("Failed to add tag association to new notebook: %v", err)
			return err
		}
	}

	return nil
}

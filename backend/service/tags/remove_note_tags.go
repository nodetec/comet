package tags

import (
	"comet/backend/db"
	"log"
)

// RemoveNoteTags removes all tag associations for a given note ID and deletes tags with no remaining associations
func RemoveNoteTags(noteID int) error {
	// Get all tag IDs associated with the note
	var tagIDs []int
	err := db.DB.Select(&tagIDs, "SELECT tag_id FROM notes_tags WHERE note_id = ?", noteID)
	if err != nil {
		log.Printf("Failed to retrieve tag associations for note ID %d: %v", noteID, err)
		return err
	}

	// Remove all tag associations for the note
	_, err = db.DB.Exec("DELETE FROM notes_tags WHERE note_id = ?", noteID)
	if err != nil {
		log.Printf("Failed to remove tag associations for note ID %d: %v", noteID, err)
		return err
	}

	// Check for remaining associations and remove tags with no remaining associations
	for _, tagID := range tagIDs {
		var count int
		err = db.DB.Get(&count, "SELECT COUNT(*) FROM notes_tags WHERE tag_id = ?", tagID)
		if err != nil {
			log.Printf("Failed to count remaining associations for tag ID %d: %v", tagID, err)
			return err
		}
		if count == 0 {
			_, err = db.DB.Exec("DELETE FROM tags WHERE id = ?", tagID)
			if err != nil {
				log.Printf("Failed to delete tag ID %d: %v", tagID, err)
				return err
			}
		}
	}

	return nil
}

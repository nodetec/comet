package notes

import (
	"comet/backend/db"
	"database/sql"
	"log"
)

// TrashNote moves a note to the trash by its ID, removes its tag associations, and sets it as inactive
func TrashNote(id int) error {
	tx, err := db.DB.Begin()
	if err != nil {
		log.Printf("Failed to begin transaction: %v", err)
		return err
	}

	_, err = tx.Exec("UPDATE notes SET trashed_at = CURRENT_TIMESTAMP, active = false WHERE id = ?", id)
	if err != nil {
		tx.Rollback()
		log.Printf("Failed to trash note: %v", err)
		return err
	}

	// Get all tag IDs associated with the note
	rows, err := tx.Query("SELECT tag_id FROM notes_tags WHERE note_id = ?", id)
	if err != nil {
		tx.Rollback()
		log.Printf("Failed to retrieve tag associations for note ID %d: %v", id, err)
		return err
	}
	defer rows.Close()

	var tagIDs []int
	for rows.Next() {
		var tagID int
		if err := rows.Scan(&tagID); err != nil {
			tx.Rollback()
			log.Printf("Failed to scan tag ID: %v", err)
			return err
		}
		tagIDs = append(tagIDs, tagID)
	}

	// Remove all tag associations for the note
	_, err = tx.Exec("DELETE FROM notes_tags WHERE note_id = ?", id)
	if err != nil {
		tx.Rollback()
		log.Printf("Failed to remove tag associations for note ID %d: %v", id, err)
		return err
	}

	// Get the notebook ID associated with the note
	var notebookID *int
	err = tx.QueryRow("SELECT notebook_id FROM notes WHERE id = ?", id).Scan(&notebookID)
	if err != nil && err != sql.ErrNoRows {
		tx.Rollback()
		log.Printf("Failed to retrieve notebook ID for note ID %d: %v", id, err)
		return err
	}

	// Check for remaining associations and remove tags with no remaining associations
	for _, tagID := range tagIDs {
		var count int
		err = tx.QueryRow("SELECT COUNT(*) FROM notes_tags WHERE tag_id = ?", tagID).Scan(&count)
		if err != nil {
			tx.Rollback()
			log.Printf("Failed to count remaining associations for tag ID %d: %v", tagID, err)
			return err
		}
		if count == 0 {
			_, err = tx.Exec("DELETE FROM tags WHERE id = ?", tagID)
			if err != nil {
				tx.Rollback()
				log.Printf("Failed to delete tag ID %d: %v", tagID, err)
				return err
			}
		}

		// If the note has a notebook, check if any other notes in the notebook have the tag
		if notebookID != nil {
			err = tx.QueryRow("SELECT COUNT(*) FROM notes_tags nt JOIN notes n ON nt.note_id = n.id WHERE nt.tag_id = ? AND n.notebook_id = ?", tagID, *notebookID).Scan(&count)
			if err != nil {
				tx.Rollback()
				log.Printf("Failed to count remaining notebook associations for tag ID %d: %v", tagID, err)
				return err
			}
			if count == 0 {
				_, err = tx.Exec("DELETE FROM notebook_tags WHERE notebook_id = ? AND tag_id = ?", *notebookID, tagID)
				if err != nil {
					tx.Rollback()
					log.Printf("Failed to delete notebook tag association for notebook ID %d and tag ID %d: %v", *notebookID, tagID, err)
					return err
				}
			}
		}
	}

	err = tx.Commit()
	if err != nil {
		log.Printf("Failed to commit transaction: %v", err)
		return err
	}

	return nil
}

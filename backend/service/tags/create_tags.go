package tags

import (
	"comet/backend/db"
	"database/sql"
	"log"
)

// CreateTags inserts multiple tags into the database and associates them with a note ID
func CreateTags(noteID int, tags []string) error {
	tx, err := db.DB.Begin()
	if err != nil {
		log.Printf("Failed to begin transaction: %v", err)
		return err
	}

	// Remove all existing associations for the note
	_, err = tx.Exec("DELETE FROM notes_tags WHERE note_id = ?", noteID)
	if err != nil {
		tx.Rollback()
		log.Printf("Failed to remove existing associations: %v", err)
		return err
	}

	// Get the notebook ID associated with the note
	var notebookID sql.NullInt64
	err = tx.QueryRow("SELECT notebook_id FROM notes WHERE id = ?", noteID).Scan(&notebookID)
	if err != nil {
		tx.Rollback()
		log.Printf("Failed to retrieve notebook ID: %v", err)
		return err
	}

	// If the notebook ID is valid, proceed with notebook-related operations
	if notebookID.Valid {
		// Remove all associations with the notebook in the notebook_tags junction table
		_, err = tx.Exec("DELETE FROM notebook_tags WHERE notebook_id = ?", notebookID.Int64)
		if err != nil {
			tx.Rollback()
			log.Printf("Failed to remove associations with notebook: %v", err)
			return err
		}
	}

	stmt, err := tx.Prepare("INSERT OR IGNORE INTO tags (name) VALUES (?)")
	if err != nil {
		log.Printf("Failed to prepare statement: %v", err)
		return err
	}
	defer stmt.Close()

	for _, tag := range tags {
		_, err := stmt.Exec(tag)
		if err != nil {
			tx.Rollback()
			log.Printf("Failed to execute statement: %v", err)
			return err
		}

		// Get the tag ID
		var tagID int
		err = tx.QueryRow("SELECT id FROM tags WHERE name = ?", tag).Scan(&tagID)
		if err != nil {
			tx.Rollback()
			log.Printf("Failed to retrieve tag ID: %v", err)
			return err
		}

		// Associate the tag with the note if not already associated
		_, err = tx.Exec("INSERT OR IGNORE INTO notes_tags (note_id, tag_id) VALUES (?, ?)", noteID, tagID)
		if err != nil {
			tx.Rollback()
			log.Printf("Failed to associate tag with note: %v", err)
			return err
		}
	}

	// Delete tags with no associated notes
	_, err = tx.Exec("DELETE FROM tags WHERE id NOT IN (SELECT DISTINCT tag_id FROM notes_tags)")
	if err != nil {
		tx.Rollback()
		log.Printf("Failed to delete unused tags: %v", err)
		return err
	}

	// If the notebook ID is valid, proceed with notebook-related operations
	if notebookID.Valid {
		// Look up all notes for the notebook and their associated tags
		rows, err := tx.Query(`
			SELECT nt.tag_id 
			FROM notes_tags nt
			JOIN notes n ON nt.note_id = n.id
			WHERE n.notebook_id = ?`, notebookID.Int64)
		if err != nil {
			tx.Rollback()
			log.Printf("Failed to retrieve tags for notebook: %v", err)
			return err
		}
		defer rows.Close()

		// Add those tags to the notebook_tags table
		for rows.Next() {
			var tagID int
			if err := rows.Scan(&tagID); err != nil {
				tx.Rollback()
				log.Printf("Failed to scan tag ID: %v", err)
				return err
			}
			_, err = tx.Exec("INSERT OR IGNORE INTO notebook_tags (notebook_id, tag_id) VALUES (?, ?)", notebookID.Int64, tagID)
			if err != nil {
				tx.Rollback()
				log.Printf("Failed to insert tag into notebook_tags: %v", err)
				return err
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

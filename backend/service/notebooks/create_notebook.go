package notebooks

import (
	"comet/backend/db"
	"log"
)

// CreateNotebook inserts a new notebook into the database
func CreateNotebook(name string) error {
	tx, err := db.DB.Begin()
	if err != nil {
		log.Printf("Failed to begin transaction: %v", err)
		return err
	}

	// Insert the new notebook
	result, err := tx.Exec("INSERT INTO notebooks (name, pinned_at, created_at, modified_at) VALUES (?, strftime('%Y-%m-%d %H:%M:%f', 'now'), strftime('%Y-%m-%d %H:%M:%f', 'now'), strftime('%Y-%m-%d %H:%M:%f', 'now'))", name)
	if err != nil {
		tx.Rollback()
		log.Printf("Failed to create notebook: %v", err)
		return err
	}

	// Get the ID of the newly created notebook
	notebookID, err := result.LastInsertId()
	if err != nil {
		tx.Rollback()
		log.Printf("Failed to get last insert ID: %v", err)
		return err
	}

	// Insert the default sort preference for the new notebook
	_, err = tx.Exec("INSERT INTO sort_preferences (notebook_id, sort_by, sort_order) VALUES (?, 'content_modified_at', 'desc')", notebookID)
	if err != nil {
		tx.Rollback()
		log.Printf("Failed to create sort preference: %v", err)
		return err
	}

	// Commit the transaction
	err = tx.Commit()
	if err != nil {
		log.Printf("Failed to commit transaction: %v", err)
		return err
	}

	return nil
}

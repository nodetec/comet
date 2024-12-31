package notes

import (
	"comet/backend/db"
	"log"
)

// SetActiveNote sets the specified note as active and deactivates all other notes
func SetActiveNote(noteID int) error {
	// Begin a transaction
	tx, err := db.DB.Begin()
	if err != nil {
		log.Printf("Failed to begin transaction: %v", err)
		return err
	}

	// Deactivate all other notes
	_, err = tx.Exec("UPDATE notes SET active = FALSE WHERE active = TRUE AND id != ?", noteID)
	if err != nil {
		tx.Rollback()
		log.Printf("Failed to deactivate other notes: %v", err)
		return err
	}

	// Activate the specified note
	_, err = tx.Exec("UPDATE notes SET active = TRUE WHERE id = ?", noteID)
	if err != nil {
		tx.Rollback()
		log.Printf("Failed to activate the specified note: %v", err)
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

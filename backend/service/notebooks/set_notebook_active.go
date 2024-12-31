package notebooks

import (
	"comet/backend/db"
	"log"
)

// SetNotebookActive sets a notebook to active by its ID and sets all other notebooks to not active
func SetNotebookActive(id int) error {
	tx, err := db.DB.Begin()
	if err != nil {
		log.Printf("Failed to begin transaction: %v", err)
		return err
	}

	_, err = tx.Exec("UPDATE notebooks SET active = false WHERE id != ?", id)
	if err != nil {
		tx.Rollback()
		log.Printf("Failed to set other notebooks to not active: %v", err)
		return err
	}

	_, err = tx.Exec("UPDATE notebooks SET active = true WHERE id = ?", id)
	if err != nil {
		tx.Rollback()
		log.Printf("Failed to set notebook to active: %v", err)
		return err
	}

	err = tx.Commit()
	if err != nil {
		log.Printf("Failed to commit transaction: %v", err)
		return err
	}

	return nil
}

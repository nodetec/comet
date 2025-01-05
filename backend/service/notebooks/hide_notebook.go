package notebooks

import (
	"comet/backend/db"
	"log"
)

// HideNotebook sets the pinned_at to NULL to hide the notebook
func HideNotebook(notebookID int) error {
	tx, err := db.DB.Begin()
	if err != nil {
		log.Printf("Failed to begin transaction: %v", err)
		return err
	}

	_, err = tx.Exec("UPDATE notebooks SET pinned_at = NULL WHERE id = ?", notebookID)
	if err != nil {
		tx.Rollback()
		log.Printf("Failed to hide notebook: %v", err)
		return err
	}

	var isActive bool
	err = tx.QueryRow("SELECT active FROM notebooks WHERE id = ?", notebookID).Scan(&isActive)
	if err != nil {
		tx.Rollback()
		log.Printf("Failed to check if notebook is active: %v", err)
		return err
	}

	if isActive {
		_, err = tx.Exec("UPDATE notebooks SET active = 0 WHERE id = ?", notebookID)
		if err != nil {
			tx.Rollback()
			log.Printf("Failed to set active notebook to false: %v", err)
			return err
		}
	}

	err = tx.Commit()
	if err != nil {
		log.Printf("Failed to commit transaction: %v", err)
		return err
	}

	return nil
}

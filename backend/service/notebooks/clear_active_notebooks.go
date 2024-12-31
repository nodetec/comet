package notebooks

import (
	"comet/backend/db"
	"log"
)

// ClearActiveNotebooks sets all notebooks to not active
func ClearActiveNotebooks() error {
	_, err := db.DB.Exec("UPDATE notebooks SET active = false")
	if err != nil {
		log.Printf("Failed to clear active notebooks: %v", err)
		return err
	}
	return nil
}

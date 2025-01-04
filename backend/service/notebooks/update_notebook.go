package notebooks

import (
	"comet/backend/db"
	"log"
)

// UpdateNotebook updates the details of an existing notebook
func UpdateNotebook(id int, name string) error {
	_, err := db.DB.Exec("UPDATE notebooks SET name = ?, modified_at = strftime('%Y-%m-%d %H:%M:%f', 'now') WHERE id = ?", name, id)
	if err != nil {
		log.Printf("Failed to update notebook: %v", err)
		return err
	}
	return nil
}

package tags

import (
	"comet/backend/db"
	"log"
)

// UpdateTag updates the details of an existing tag
func UpdateTag(id int, name, color, icon string) error {
	_, err := db.DB.Exec("UPDATE tags SET name = ?, color = ?, icon = ?, modified_at = strftime('%Y-%m-%d %H:%M:%f', 'now') WHERE id = ?", name, color, icon, id)
	if err != nil {
		log.Printf("Failed to update tag: %v", err)
		return err
	}
	return nil
}

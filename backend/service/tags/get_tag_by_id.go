package tags

import (
	"comet/backend/db"
	"comet/backend/models"
	"database/sql"
	"log"
)

// GetTagByID retrieves a single tag by its ID
func GetTagByID(id int) (*models.Tag, error) {
	var tag models.Tag
	err := db.DB.QueryRow("SELECT id, name, color, icon, created_at, modified_at FROM tags WHERE id = ?", id).Scan(&tag.ID, &tag.Name, &tag.Color, &tag.Icon, &tag.CreatedAt, &tag.ModifiedAt)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		log.Printf("Failed to get tag by ID: %v", err)
		return nil, err
	}
	return &tag, nil
}

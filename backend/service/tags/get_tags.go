package tags

import (
	"comet/backend/db"
	"comet/backend/db/schemas"
	"database/sql"
	"log"
)

// GetTags retrieves all tags from the database
func GetTags() ([]schemas.Tag, error) {
	var tags []schemas.Tag
	var activeNotebookID *int

	// Check if there is an active notebook
	err := db.DB.Get(&activeNotebookID, "SELECT id FROM notebooks WHERE active = true LIMIT 1")
	if err != nil && err != sql.ErrNoRows {
		log.Printf("Failed to get active notebook: %v", err)
		return nil, err
	}

	var rows *sql.Rows
	if activeNotebookID != nil {
		// Retrieve tags associated with the active notebook
		query := `
			SELECT tags.id, tags.name, tags.color, tags.icon, tags.active, tags.inactive, tags.created_at, tags.modified_at
			FROM tags
			JOIN notebook_tags ON tags.id = notebook_tags.tag_id
			WHERE notebook_tags.notebook_id = ?
			ORDER BY tags.name ASC`
		rows, err = db.DB.Query(query, *activeNotebookID)
	} else {
		// Retrieve all tags
		query := "SELECT id, name, color, icon, active, inactive, created_at, modified_at FROM tags ORDER BY name ASC"
		rows, err = db.DB.Query(query)
	}
	if err != nil {
		log.Printf("Failed to get tags: %v", err)
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var tag schemas.Tag
		if err := rows.Scan(&tag.ID, &tag.Name, &tag.Color, &tag.Icon, &tag.Active, &tag.Inactive, &tag.CreatedAt, &tag.ModifiedAt); err != nil {
			log.Printf("Failed to scan tag: %v", err)
			return nil, err
		}
		tags = append(tags, tag)
	}
	return tags, nil
}

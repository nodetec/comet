package relays

import (
	"comet/backend/db"
	"comet/backend/models"
	"log"
)

// GetRelayByID retrieves a relay by its ID
func GetRelayByID(id int) (*models.Relay, error) {
	var relay models.Relay
	err := db.DB.QueryRow("SELECT id, url, read, write, sync, created_at, modified_at FROM relays WHERE id = ?", id).Scan(
		&relay.ID, &relay.URL, &relay.Read, &relay.Write, &relay.Sync, &relay.CreatedAt, &relay.ModifiedAt)
	if err != nil {
		log.Printf("Failed to get relay by ID: %v", err)
		return nil, err
	}
	return &relay, nil
}

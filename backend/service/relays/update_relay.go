package relays

import (
	"comet/backend/db"
	"comet/backend/models"
	"log"
)

// UpdateRelay updates an existing relay in the database
func UpdateRelay(relay models.Relay) error {
	query := `UPDATE relays SET url = ?, read = ?, write = ?, sync = ?, modified_at = strftime('%Y-%m-%d %H:%M:%f', 'now') WHERE id = ?`
	_, err := db.DB.Exec(query, relay.URL, relay.Read, relay.Write, relay.Sync, relay.ID)
	if err != nil {
		log.Printf("Failed to update relay: %v", err)
		return err
	}
	return nil
}

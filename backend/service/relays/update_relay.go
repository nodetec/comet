package relays

import (
	"comet/backend/db"
	"comet/backend/db/schemas"
	"log"
)

// UpdateRelay updates an existing relay in the database
func UpdateRelay(relay schemas.Relay) error {
	_, err := db.DB.Exec("UPDATE relays SET url = ?, read = ?, write = ?, sync = ? WHERE id = ?", relay.URL, relay.Read, relay.Write, relay.Sync, relay.ID)
	if err != nil {
		log.Printf("Failed to update relay: %v", err)
		return err
	}
	return nil
}

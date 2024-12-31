package relays

import (
	"comet/backend/db"
	"comet/backend/db/schemas"
	"log"
)

// CreateRelay inserts a new relay into the database and returns the created relay
func CreateRelay(url string, read, write, sync bool) (*schemas.Relay, error) {
	result, err := db.DB.Exec("INSERT INTO relays (url, read, write, sync) VALUES (?, ?, ?, ?)", url, read, write, sync)
	if err != nil {
		log.Printf("Failed to create relay: %v", err)
		return nil, err
	}

	id, err := result.LastInsertId()
	if err != nil {
		log.Printf("Failed to get last insert ID: %v", err)
		return nil, err
	}

	return GetRelayByID(int(id))
}

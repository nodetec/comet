package relays

import (
	"comet/backend/db"
	"comet/backend/models"
	"log"
)

// GetAllRelays retrieves all relays from the database
func GetAllRelays() ([]*models.Relay, error) {
	rows, err := db.DB.Query("SELECT id, url, read, write, sync FROM relays")
	if err != nil {
		log.Printf("Failed to retrieve relays: %v", err)
		return nil, err
	}
	defer rows.Close()

	var relays []*models.Relay
	for rows.Next() {
		var relay models.Relay
		if err := rows.Scan(&relay.ID, &relay.URL, &relay.Read, &relay.Write, &relay.Sync); err != nil {
			log.Printf("Failed to scan relay: %v", err)
			return nil, err
		}
		relays = append(relays, &relay)
	}

	if err := rows.Err(); err != nil {
		log.Printf("Rows error: %v", err)
		return nil, err
	}

	if len(relays) == 0 {
		return nil, nil
	}

	return relays, nil
}

package relays

import (
	"comet/backend/db"
	"comet/backend/models"
	"log"
)

// RelayData represents the data needed to create a relay
type RelayData struct {
	URL   string
	Read  bool
	Write bool
	Sync  bool
}

// ReplaceRelays removes all existing relays and inserts the new list of relays into the database
func ReplaceRelays(relayData []RelayData) ([]*models.Relay, error) {
	tx, err := db.DB.Begin()
	if err != nil {
		log.Printf("Failed to begin transaction: %v", err)
		return nil, err
	}

	_, err = tx.Exec("DELETE FROM relays")
	if err != nil {
		tx.Rollback()
		log.Printf("Failed to delete existing relays: %v", err)
		return nil, err
	}

	createdRelays := []*models.Relay{}
	for _, data := range relayData {
		result, err := tx.Exec("INSERT INTO relays (url, read, write, sync) VALUES (?, ?, ?, ?)", data.URL, data.Read, data.Write, data.Sync)
		if err != nil {
			tx.Rollback()
			log.Printf("Failed to create relay: %v", err)
			return nil, err
		}

		id, err := result.LastInsertId()
		if err != nil {
			tx.Rollback()
			log.Printf("Failed to get last insert ID: %v", err)
			return nil, err
		}

		createdRelay := &models.Relay{
			ID:    int(id),
			URL:   data.URL,
			Read:  data.Read,
			Write: data.Write,
			Sync:  data.Sync,
		}
		createdRelays = append(createdRelays, createdRelay)
	}

	if err := tx.Commit(); err != nil {
		log.Printf("Failed to commit transaction: %v", err)
		return nil, err
	}

	return createdRelays, nil
}

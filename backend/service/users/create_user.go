package users

import (
	"comet/backend/db"
	"comet/backend/db/schemas"
	"log"
)

func CreateUser(nsec, npub string, active bool) (*schemas.User, error) {
	user := &schemas.User{
		Nsec:   nsec,
		Npub:   npub,
		Active: active,
	}

	query := `INSERT INTO users (nsec, npub, active) VALUES (?, ?, ?)`
	result, err := db.DB.Exec(query, user.Nsec, user.Npub, user.Active)
	if err != nil {
		log.Printf("Failed to create user: %v", err)
		return nil, err
	}

	id, err := result.LastInsertId()
	if err != nil {
		return nil, err
	}
	user.ID = int(id)

	return user, nil
}

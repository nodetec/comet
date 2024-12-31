package users

import (
	"comet/backend/db"
	"comet/backend/db/schemas"
)

func GetActiveUser() (*schemas.User, error) {
	query := `SELECT id, nsec, npub, active, created_at, modified_at FROM users WHERE active = 1 LIMIT 1`
	row := db.DB.QueryRow(query)

	var user schemas.User
	err := row.Scan(&user.ID, &user.Nsec, &user.Npub, &user.Active, &user.CreatedAt, &user.ModifiedAt)
	if err != nil {
		return nil, err
	}

	return &user, nil
}

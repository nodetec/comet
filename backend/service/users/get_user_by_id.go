package users

import (
	"comet/backend/db"
	"comet/backend/db/schemas"
	"database/sql"
	"errors"
)

func GetUserByID(id int) (*schemas.User, error) {
	user := &schemas.User{}
	query := `SELECT id, nsec, npub, active, created_at, modified_at FROM users WHERE id = ?`
	err := db.DB.QueryRow(query, id).Scan(&user.ID, &user.Nsec, &user.Npub, &user.Active, &user.CreatedAt, &user.ModifiedAt)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, errors.New("user not found")
		}
		return nil, err
	}

	return user, nil
}

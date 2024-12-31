package users

import (
	"comet/backend/db"
	"comet/backend/db/schemas"
)

func UpdateUser(user schemas.User) error {
	query := `UPDATE users SET nsec = ?, npub = ?, active = ? WHERE id = ?`
	_, err := db.DB.Exec(query, user.Nsec, user.Npub, user.Active, user.ID)
	if err != nil {
		return err
	}

	return nil
}

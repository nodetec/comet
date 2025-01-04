package users

import (
	"comet/backend/db"
	"comet/backend/models"
)

func UpdateUser(user models.User) error {
	query := `UPDATE users SET nsec = ?, npub = ?, active = ?, modified_at = strftime('%Y-%m-%d %H:%M:%f', 'now') WHERE id = ?`
	_, err := db.DB.Exec(query, user.Nsec, user.Npub, user.Active, user.ID)
	if err != nil {
		return err
	}

	return nil
}

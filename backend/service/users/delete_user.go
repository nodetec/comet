package users

import (
	"comet/backend/db"
)

func DeleteUser(id int) error {
	query := `DELETE FROM users WHERE id = ?`
	_, err := db.DB.Exec(query, id)
	if err != nil {
		return err
	}

	return nil
}

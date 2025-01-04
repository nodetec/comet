package models

// User represents a row in the users table
type User struct {
	ID         int    `db:"id"`
	Nsec       string `db:"nsec"`
	Npub       string `db:"npub"`
	Active     bool   `db:"active"`
	CreatedAt  string `db:"created_at"`
	ModifiedAt string `db:"modified_at"`
	Name       string `db:"name"`
	About      string `db:"about"`
	Picture    string `db:"picture"`
	Nip05      string `db:"nip05"`
	Website    string `db:"website"`
	Lud16      string `db:"lud16"`
}

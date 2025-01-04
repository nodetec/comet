package models

// Relay represents a row in the relays table
type Relay struct {
	ID         int    `db:"id"`
	URL        string `db:"url"`
	Read       bool   `db:"read"`
	Write      bool   `db:"write"`
	Sync       bool   `db:"sync"`
	CreatedAt  string `db:"created_at"`
	ModifiedAt string `db:"modified_at"`
}

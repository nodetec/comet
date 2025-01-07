package models

// Relay represents a row in the relays table
type SortPreference struct {
	ID         int    `db:"id"`
	NotebookID int    `db:"notebook_id"`
	SortBy     string `db:"sort_by"`
	SortOrder  string `db:"sort_order"`
}

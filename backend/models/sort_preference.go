package models

// Relay represents a row in the relays table
type SortPreference struct {
	ID         int    `db:"id"`
	NotebookID int    `db:"notebook_id"`
	SortBy     string `db:"sort_by"`    // content_modified_at, created_at, title
	SortOrder  string `db:"sort_order"` // asc, desc
}

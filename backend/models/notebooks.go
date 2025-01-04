package models

// Notebook represents a notebook in the application
type Notebook struct {
	ID           int     `db:"id"`
	Name         string  `db:"name"`
	CreatedAt    string  `db:"created_at"`
	ModifiedAt   string  `db:"modified_at"`
	PinnedAt     *string `db:"pinned_at"`
	DisplayOrder int     `db:"display_order"`
	Active       bool    `db:"active"`
}

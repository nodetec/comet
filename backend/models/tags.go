package models

// Tag represents a tag in the application
type Tag struct {
	ID         int     `db:"id"`
	Name       string  `db:"name"`
	Color      *string `db:"color"`
	Icon       *string `db:"icon"`
	Active     bool    `db:"active"`
	Inactive   bool    `db:"inactive"`
	CreatedAt  string  `db:"created_at"`
	ModifiedAt string  `db:"modified_at"`
}

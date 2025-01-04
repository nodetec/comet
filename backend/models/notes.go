package models

// Note represents a note in the application
type Note struct {
	ID                int     `db:"id"`
	NotebookID        *int    `db:"notebook_id"`
	Content           string  `db:"content"`
	Title             string  `db:"title"`
	CreatedAt         string  `db:"created_at"`
	ModifiedAt        string  `db:"modified_at"`
	ContentModifiedAt string  `db:"content_modified_at"`
	PublishedAt       *string `db:"published_at"`
	EventAddress      *string `db:"event_address"`
	Identifier        *string `db:"identifier"`
	PinnedAt          *string `db:"pinned_at"`
	TrashedAt         *string `db:"trashed_at"`
	ArchivedAt        *string `db:"archived_at"`
	Active            bool    `db:"active"`
	Author            *string `db:"author"`
}

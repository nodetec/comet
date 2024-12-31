package schemas

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

// TagsTableSchema defines the schema for the tags table
const TagsTableSchema = `
CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    color TEXT NULL,
    icon TEXT NULL,
    active BOOLEAN NOT NULL DEFAULT 0,
    inactive BOOLEAN NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    modified_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (name),
    CHECK (name <> ''),
    CHECK (active + inactive <= 1)
);

CREATE INDEX IF NOT EXISTS idx_name ON tags(name);
CREATE INDEX IF NOT EXISTS idx_created_at ON tags(created_at);
CREATE INDEX IF NOT EXISTS idx_active ON tags(active);`

// UpdateTagsModifiedAtTrigger defines the trigger for updating modified_at on update
const UpdateTagsModifiedAtTrigger = `
CREATE TRIGGER IF NOT EXISTS update_tags_modified_at
AFTER UPDATE ON tags
FOR EACH ROW
BEGIN
    UPDATE tags SET modified_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
END;`

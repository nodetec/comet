package schemas

// NotebooksTableSchema defines the schema for the notebooks table
const NotebooksTableSchema = `
CREATE TABLE IF NOT EXISTS notebooks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    modified_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    pinned BOOLEAN NOT NULL DEFAULT 1,
    active BOOLEAN NOT NULL DEFAULT 0,
    UNIQUE (name),
    CHECK (name <> '')
);

CREATE INDEX IF NOT EXISTS idx_name ON notebooks(name);
CREATE INDEX IF NOT EXISTS idx_created_at ON notebooks(created_at);`

// UpdateNotebooksModifiedAtTrigger defines the trigger for updating modified_at on update
const UpdateNotebooksModifiedAtTrigger = `
CREATE TRIGGER IF NOT EXISTS update_notebooks_modified_at
AFTER UPDATE ON notebooks
FOR EACH ROW
BEGIN
    UPDATE notebooks SET modified_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
END;`

// Notebook represents a notebook in the application
type Notebook struct {
	ID         int    `db:"id"`
	Name       string `db:"name"`
	CreatedAt  string `db:"created_at"`
	ModifiedAt string `db:"modified_at"`
	Pinned     bool   `db:"pinned"`
	Active     bool   `db:"active"`
}

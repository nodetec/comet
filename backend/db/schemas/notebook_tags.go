package schemas

// NotebookTagsTableSchema defines the schema for the notebook_tags junction table
const NotebookTagsTableSchema = `
CREATE TABLE IF NOT EXISTS notebook_tags (
    notebook_id INTEGER NOT NULL,
    tag_id INTEGER NOT NULL,
    PRIMARY KEY (notebook_id, tag_id),
    FOREIGN KEY (notebook_id) REFERENCES notebooks(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE,
    CHECK (notebook_id > 0),
    CHECK (tag_id > 0)
);

CREATE INDEX IF NOT EXISTS idx_notebook_id ON notebook_tags(notebook_id);
CREATE INDEX IF NOT EXISTS idx_tag_id ON notebook_tags(tag_id);`

// NotebookTag represents a junction between a notebook and a tag
type NotebookTag struct {
	NotebookID int `db:"notebook_id"`
	TagID      int `db:"tag_id"`
}

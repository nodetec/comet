package schemas

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

// RelaysTableSchema defines the schema for the relays table
const RelaysTableSchema = `
CREATE TABLE IF NOT EXISTS relays (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT NOT NULL,
    read BOOLEAN NOT NULL DEFAULT FALSE,
    write BOOLEAN NOT NULL DEFAULT TRUE,
    sync BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    modified_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (read IN (0, 1)),
    CHECK (write IN (0, 1)),
    CHECK (sync IN (0, 1))
);

CREATE INDEX IF NOT EXISTS idx_url ON relays(url);
CREATE INDEX IF NOT EXISTS idx_created_at ON relays(created_at);

INSERT INTO relays (url, read, write, sync, created_at, modified_at)
SELECT 'wss://relay.notestack.com', 1, 1, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM relays);`

// UpdateRelaysModifiedAtTrigger defines the trigger for updating modified_at on update
const UpdateRelaysModifiedAtTrigger = `
CREATE TRIGGER IF NOT EXISTS update_relays_modified_at
AFTER UPDATE ON relays
FOR EACH ROW
BEGIN
    UPDATE relays SET modified_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
END;`

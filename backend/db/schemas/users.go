package schemas

// User represents a row in the users table
type User struct {
	ID         int    `db:"id"`
	Nsec       string `db:"nsec"`
	Npub       string `db:"npub"`
	Active     bool   `db:"active"`
	CreatedAt  string `db:"created_at"`
	ModifiedAt string `db:"modified_at"`
	Name       string `db:"name"`
	About      string `db:"about"`
	Picture    string `db:"picture"`
	Nip05      string `db:"nip05"`
	Website    string `db:"website"`
	Lud16      string `db:"lud16"`
}

// UsersTableSchema defines the schema for the users table
const UsersTableSchema = `
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nsec TEXT NOT NULL,
    npub TEXT NOT NULL,
    active BOOLEAN NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    modified_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    name TEXT,
    username TEXT,
    about TEXT,
    picture TEXT,
    nip05 TEXT,
    website TEXT,
    banner TEXT,
    lud16 TEXT,
    display_name TEXT,
    UNIQUE (nsec),
    UNIQUE (npub),
    CHECK (active IN (0, 1))
);

CREATE INDEX IF NOT EXISTS idx_nsec ON users(nsec);
CREATE INDEX IF NOT EXISTS idx_npub ON users(npub);
CREATE INDEX IF NOT EXISTS idx_active ON users(active);`

// UpdateUsersModifiedAtTrigger defines the trigger for updating modified_at on update
const UpdateUsersModifiedAtTrigger = `
CREATE TRIGGER IF NOT EXISTS update_users_modified_at
AFTER UPDATE ON users
FOR EACH ROW
BEGIN
    UPDATE users SET modified_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
END;`

// EnforceSingleActiveUserTrigger defines the trigger to enforce only one active user
const EnforceSingleActiveUserTrigger = `
CREATE TRIGGER IF NOT EXISTS enforce_single_active_user
BEFORE UPDATE OF active ON users
FOR EACH ROW
WHEN NEW.active = 1
BEGIN
    UPDATE users SET active = 0 WHERE active = 1;
END;`

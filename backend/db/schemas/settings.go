package schemas

// SettingsTableSchema defines the schema for the settings table
const SettingsTableSchema = `
CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    modified_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (key)
);

CREATE INDEX IF NOT EXISTS idx_key ON settings(key);
CREATE INDEX IF NOT EXISTS idx_created_at ON settings(created_at);`

// UpdateSettingsModifiedAtTrigger defines the trigger for updating modified_at on update
const UpdateSettingsModifiedAtTrigger = `
CREATE TRIGGER IF NOT EXISTS update_settings_modified_at
AFTER UPDATE ON settings
FOR EACH ROW
BEGIN
    UPDATE settings SET modified_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
END;`

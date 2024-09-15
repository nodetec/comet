-- +goose Up
-- +goose StatementBegin
CREATE TABLE IF NOT EXISTS nostr_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nsec TEXT NOT NULL,
    npub TEXT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT FALSE,
    logged_in BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TEXT NOT NULL,
    modified_at TEXT NOT NULL
);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS nostr_keys;
-- +goose StatementEnd

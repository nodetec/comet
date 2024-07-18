-- +goose Up
-- +goose StatementBegin
CREATE TABLE IF NOT EXISTS relay (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT NOT NULL,
    read BOOLEAN NOT NULL DEFAULT FALSE,
    write BOOLEAN NOT NULL DEFAULT TRUE,
    sync BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TEXT NOT NULL,
    modified_at TEXT NOT NULL
);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS relay;
-- +goose StatementEnd

-- +goose Up
-- +goose StatementBegin
ALTER TABLE notes ADD COLUMN identifier TEXT;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
-- Note: SQLite does not support dropping columns directly, so this is a placeholder.
-- In practice, you would need to create a new table without the column, copy the data, and rename it.
-- This is a simplified example.
-- ALTER TABLE notes DROP COLUMN identifier;
-- +goose StatementEnd

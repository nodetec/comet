-- +goose Up
-- +goose StatementBegin
ALTER TABLE notes ADD COLUMN author TEXT;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
CREATE TABLE notes_new AS SELECT id, notebook_id, content, title, created_at, modified_at, published_at, event_address, identifier, pinned, trashed_at, archived_at, active FROM notes;
DROP TABLE notes;
ALTER TABLE notes_new RENAME TO notes;
-- +goose StatementEnd

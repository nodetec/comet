-- +goose Up
-- +goose StatementBegin
ALTER TABLE trash ADD COLUMN notebook_id INTEGER NOT NULL DEFAULT 0;
ALTER TABLE trash ADD COLUMN published_at TEXT;
ALTER TABLE trash ADD COLUMN event_id TEXT;
ALTER TABLE trash ADD COLUMN notetype TEXT NOT NULL DEFAULT "";
ALTER TABLE trash ADD COLUMN filetype TEXT NOT NULL DEFAULT "";
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE trash DROP COLUMN notebook_id;
ALTER TABLE trash DROP COLUMN published_at;
ALTER TABLE trash DROP COLUMN event_id;
ALTER TABLE trash DROP COLUMN notetype;
ALTER TABLE trash DROP COLUMN filetype;
-- +goose StatementEnd

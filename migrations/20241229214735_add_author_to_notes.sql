-- +goose Up
-- +goose StatementBegin
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notes') THEN
        ALTER TABLE notes ADD COLUMN author TEXT;
    END IF;
END $$;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notes') THEN
        CREATE TABLE notes_new AS SELECT id, notebook_id, content, title, created_at, modified_at, published_at, event_address, identifier, pinned, trashed_at, archived_at, active FROM notes;
        DROP TABLE notes;
        ALTER TABLE notes_new RENAME TO notes;
    END IF;
END $$;
-- +goose StatementEnd

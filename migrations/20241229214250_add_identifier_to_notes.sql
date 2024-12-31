-- +goose Up
-- +goose StatementBegin
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notes') THEN
        ALTER TABLE notes ADD COLUMN identifier TEXT;
    END IF;
END $$;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
-- Note: SQLite does not support dropping columns directly, so this is a placeholder.
-- In practice, you would need to create a new table without the column, copy the data, and rename it.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notes') THEN
        -- This is a simplified example.
        -- ALTER TABLE notes DROP COLUMN identifier;
    END IF;
END $$;
-- +goose StatementEnd

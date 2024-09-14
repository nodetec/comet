package migrations

import (
	"context"
	"database/sql"
	"fmt"
	"log"

	"github.com/pressly/goose/v3"
)

func init() {
	// goose.AddNamedMigrationContext("20240913_add_column_if_not_exists", upAddColumnsToTrashTable, downAddColumnsToTrashTable)
	goose.AddMigrationContext(upAddColumnsToTrashTable, downAddColumnsToTrashTable)
}

// List of columns to be added (if they don't exist)
var columnsToAdd = map[string]string{
	"notebook_id":  "INTEGER NOT NULL DEFAULT 0",
	"published_at": "TEXT",
	"event_id":     "TEXT",
	"notetype":     "TEXT NOT NULL DEFAULT ''",
	"filetype":     "TEXT NOT NULL DEFAULT ''",
	"donut":        "TEXT NOT NULL DEFAULT ''",
}

func upAddColumnsToTrashTable(ctx context.Context, tx *sql.Tx) error {
	for columnName, columnType := range columnsToAdd {
		// Step 1: Check if the column exists
		var exists int
		query := fmt.Sprintf(`
			SELECT 1 FROM pragma_table_info('trash') WHERE name = '%s';
		`, columnName)

		err := tx.QueryRowContext(ctx, query).Scan(&exists)
		if err == sql.ErrNoRows {
			// Column does not exist, add it
			alterTable := fmt.Sprintf(`
				ALTER TABLE trash ADD COLUMN %s %s;
			`, columnName, columnType)

			_, err = tx.ExecContext(ctx, alterTable)
			if err != nil {
				return fmt.Errorf("failed to add column '%s': %v", columnName, err)
			}

			log.Printf("Column '%s' added successfully.\n", columnName)
		} else if err != nil {
			return fmt.Errorf("error checking for column '%s': %v", columnName, err)
		} else {
			log.Printf("Column '%s' already exists, skipping.\n", columnName)
		}
	}

	return nil
}

func downAddColumnsToTrashTable(ctx context.Context, tx *sql.Tx) error {
	log.Println("Nothing for now")
	return nil
}

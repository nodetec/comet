package db

import (
	"log"
	"path/filepath"

	"embed"

	"github.com/adrg/xdg"
	"github.com/jmoiron/sqlx"
	_ "github.com/mattn/go-sqlite3"
	"github.com/pressly/goose/v3"
)

// Database instance
var DB *sqlx.DB

// Init initializes the SQLite database and creates tables
func Init(embedMigrations embed.FS) {
	var err error

	// Get the data home directory
	dbPath := filepath.Join(xdg.DataHome, "comet", "comet.db")

	// Set PRAGMAs in the connection string
	dbConn, err := sqlx.Open("sqlite3", dbPath+"?_foreign_keys=on&_journal_mode=WAL&_synchronous=NORMAL&_temp_store=MEMORY&_cache_size=-2000")
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	DB = dbConn

	goose.SetBaseFS(embedMigrations)

	if err := goose.SetDialect("sqlite3"); err != nil {
		panic(err)
	}

	// Perform migrations
	if err := goose.Up(DB.DB, "migrations"); err != nil {
		log.Fatalf("Failed to apply migrations: %v", err)
	}

	log.Println("All tables created or already exist.")
}

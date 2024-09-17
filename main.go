package main

import (
	"context"
	"database/sql"
	"embed"
	"fmt"
	"log"
	"os"

	"github.com/wailsapp/wails/v3/pkg/application"

	"github.com/adrg/xdg"
	"github.com/nodetec/comet/contextmenu"
	"github.com/nodetec/comet/db"
	_ "github.com/nodetec/comet/migrations"
	"github.com/nodetec/comet/service"

	"github.com/pressly/goose/v3"

	_ "github.com/mattn/go-sqlite3"
)

//go:embed frontend/dist
var assets embed.FS

//go:embed sql/schema.sql
var ddl string

//go:embed migrations/*.sql migrations/*.go
var embedMigrations embed.FS

func main() {
	ctx := context.Background()

	// Define the directory path for the SQLite database file
	dbDir := fmt.Sprintf("%s/comet", xdg.DataHome)
	dbPath := fmt.Sprintf("%s/comet.db", dbDir)

	// Ensure the directory exists
	if err := os.MkdirAll(dbDir, 0755); err != nil {
		log.Fatalf("failed to create directory: %v", err)
	}

	// Open the SQLite database
	dbConn, err := sql.Open("sqlite3", dbPath+"?_foreign_keys=on")
	if err != nil {
		log.Fatal(err)
	}

	// Create tables
	if _, err := dbConn.ExecContext(ctx, ddl); err != nil {
		log.Fatal(err)
	}

	goose.SetBaseFS(embedMigrations)

	if err := goose.SetDialect("sqlite3"); err != nil {
		panic(err)
	}

	if err := goose.Up(dbConn, "migrations"); err != nil {
		panic(err)
	}

	queries := db.New(dbConn)
	// customQueries := db.CustomQueries(dbConn)
	logger := log.New(os.Stdout, "INFO: ", log.LstdFlags)

	// Create the NoteService with the queries and logger
	noteService := service.NewNoteService(queries, logger)
	tagService := service.NewTagService(queries, logger)
	noteTagService := service.NewNoteTagService(queries, logger)
	notebookService := service.NewNotebookService(queries, logger)
	settingService := service.NewSettingService(queries, logger)
	relayService := service.NewRelayService(queries, logger)
	nostrKeyService := service.NewNostrKeyService(queries, logger)

	app := application.New(application.Options{
		Name:        "comet",
		Description: "A demo of using raw HTML & CSS",
		Services: []application.Service{
			application.NewService(noteService),
			application.NewService(tagService),
			application.NewService(noteTagService),
			application.NewService(notebookService),
			application.NewService(settingService),
			application.NewService(relayService),
			application.NewService(nostrKeyService),
		},
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(assets),
		},
		Mac: application.MacOptions{
			ApplicationShouldTerminateAfterLastWindowClosed: true,
		},
	})

	mainWindow := app.NewWebviewWindowWithOptions(application.WebviewWindowOptions{
		Name:             "main",
		Title:            "Comet",
		Width:            1200,
		Height:           600,
		URL:              "/",
		MinWidth:         500,
		MinHeight:        250,
		Centered:         true,
		BackgroundColour: application.NewRGB(27, 38, 54),
		Mac: application.MacWindow{
			InvisibleTitleBarHeight: 50,
			Backdrop:                application.MacBackdropTranslucent,
			TitleBar:                application.MacTitleBarHiddenInsetUnified,
		},
	})

	contextmenu.CreateNoteMenu(app, mainWindow, ctx, noteService, noteTagService)
	contextmenu.CreateTagMenu(app, mainWindow, ctx, tagService)
	contextmenu.CreateNoteTagMenu(app, mainWindow, ctx, noteTagService)
	contextmenu.CreateTrashNoteMenu(app, mainWindow, ctx, noteService, noteTagService, tagService)

	err = app.Run()
	if err != nil {
		log.Fatal(err)
	}
}

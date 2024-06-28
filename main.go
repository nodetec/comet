package main

import (
	"context"
	"database/sql"
	"embed"
	"log"
	"os"

	"github.com/wailsapp/wails/v3/pkg/application"

	"github.com/nodetec/captains-log/db"
	"github.com/nodetec/captains-log/service"

	_ "github.com/mattn/go-sqlite3"
)

//go:embed frontend/dist
var assets embed.FS

//go:embed sql/schema.sql
var ddl string

func main() {
	ctx := context.Background()

	dbConn, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		log.Fatal(err)
	}

	// Create tables
	if _, err := dbConn.ExecContext(ctx, ddl); err != nil {
		log.Fatal(err)
	}

	queries := db.New(dbConn)
	logger := log.New(os.Stdout, "INFO: ", log.LstdFlags)

	// Create the NoteService with the queries and logger
	noteService := service.NewNoteService(queries, logger)

	app := application.New(application.Options{
		Name:        "captains-log",
		Description: "A demo of using raw HTML & CSS",
		Services: []application.Service{
			application.NewService(noteService),
		},
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(assets),
		},
		Mac: application.MacOptions{
			ApplicationShouldTerminateAfterLastWindowClosed: true,
		},
	})

	app.NewWebviewWindowWithOptions(application.WebviewWindowOptions{
		Title:  "Window 1",
		Width:  1200,
		Height: 600,
		Mac: application.MacWindow{
			InvisibleTitleBarHeight: 50,
			Backdrop:                application.MacBackdropTranslucent,
			TitleBar:                application.MacTitleBarHiddenInset,
		},
		BackgroundColour: application.NewRGB(27, 38, 54),
		URL:              "/",
	})

	err = app.Run()

	if err != nil {
		log.Fatal(err)
	}
}


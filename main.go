package main

import (
	"embed"
	_ "embed"
	"log"

	"database/sql"

	"github.com/wailsapp/wails/v3/pkg/application"

	_ "github.com/mattn/go-sqlite3"
)

//go:embed frontend/dist
var assets embed.FS

//go:embed sql/schema.sql
var ddl string

func main() {

	ctx := context.Background()

	db, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		return err
	}

	// create tables
	if _, err := db.ExecContext(ctx, ddl); err != nil {
		return err
	}

	app := application.New(application.Options{
		Name:        "captains-log",
		Description: "A demo of using raw HTML & CSS",
		Services: []application.Service{
			application.NewService(&NoteService{}),
		},
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(assets),
		},
		Mac: application.MacOptions{
			ApplicationShouldTerminateAfterLastWindowClosed: true,
		},
	})

	app.NewWebviewWindowWithOptions(application.WebviewWindowOptions{
		Title: "Window 1",
		Mac: application.MacWindow{
			InvisibleTitleBarHeight: 50,
			Backdrop:                application.MacBackdropTranslucent,
			TitleBar:                application.MacTitleBarHiddenInset,
		},
		BackgroundColour: application.NewRGB(27, 38, 54),
		URL:              "/",
	})

	err := app.Run()

	if err != nil {
		log.Fatal(err)
	}
}

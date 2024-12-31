package main

import (
	"embed"
	"log"

	"github.com/wailsapp/wails/v3/pkg/application"

	_ "github.com/mattn/go-sqlite3"

	"comet/backend/db"
	"comet/backend/menus"
	"comet/backend/service"
)

//go:embed all:frontend/dist
var assets embed.FS

//go:embed migrations/*.sql
var embedMigrations embed.FS

func main() {

	db.Init(embedMigrations)

	app := application.New(application.Options{
		Name:        "Comet",
		Description: "Desktop note taking app for nostr",
		Services: []application.Service{
			application.NewService(&service.AppService{}), // Add the AppService here
		},
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(assets),
		},
		Mac: application.MacOptions{
			ApplicationShouldTerminateAfterLastWindowClosed: true,
		},
	})

	app.NewWebviewWindowWithOptions(application.WebviewWindowOptions{
		Title:     "Comet",
		Width:     1200,
		Height:    600,
		URL:       "/",
		MinWidth:  500,
		MinHeight: 250,
		Mac: application.MacWindow{
			InvisibleTitleBarHeight: 50,
			Backdrop:                application.MacBackdropTranslucent,
			TitleBar:                application.MacTitleBarHiddenInsetUnified,
		},
		BackgroundColour: application.NewRGB(27, 38, 54),
	})

	createNoteMenu := menus.CreateNoteCardContextMenu(app)
	createTrashNoteMenu := menus.CreateTrashNoteCardContextMenu(app)
	createNotebookMenu := menus.CreateNotebookContextMenu(app)

	app.RegisterContextMenu("note_card", createNoteMenu)
	app.RegisterContextMenu("trash_note_card", createTrashNoteMenu)
	app.RegisterContextMenu("notebook", createNotebookMenu)

	err := app.Run()

	if err != nil {
		log.Fatal(err)
	}
}

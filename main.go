package main

import (
	"embed"
	"log"

	"github.com/wailsapp/wails/v3/pkg/application"

	_ "github.com/mattn/go-sqlite3"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {

	app := application.New(application.Options{
		Name:        "Comet-Alpha",
		Description: "Desktop note taking app for nostr",
		Services:    []application.Service{},
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
		MinWidth:  900,
		MinHeight: 250,
		Mac: application.MacWindow{
			InvisibleTitleBarHeight: 50,
			Backdrop:                application.MacBackdropTranslucent,
			TitleBar:                application.MacTitleBarHiddenInsetUnified,
		},
		BackgroundColour: application.NewRGB(27, 38, 54),
	})

	err := app.Run()

	if err != nil {
		log.Fatal(err)
	}
}

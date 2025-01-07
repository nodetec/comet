package menus

import (
	"github.com/wailsapp/wails/v3/pkg/application"
)

func CreateNoteFeedContextMenu(app *application.App) *application.Menu {
	contextMenu := app.NewMenu()

	var sortBySubMenu = contextMenu.AddSubmenu("Sort By")

	sortBySubMenu.AddSeparator()

	sortBySubMenu.AddCheckbox("Date Edited", true).OnClick(func(data *application.Context) {

	})

	sortBySubMenu.Add("Date Created").OnClick(func(data *application.Context) {
	})

	sortBySubMenu.Add("Title").OnClick(func(data *application.Context) {
	})

	return contextMenu
}

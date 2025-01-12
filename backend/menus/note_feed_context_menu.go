package menus

import (
	"comet/backend/service/sort"
	"log"

	"github.com/wailsapp/wails/v3/pkg/application"
)

func CreateNoteFeedContextMenu(app *application.App) *application.Menu {

	contextMenu := app.NewMenu()

	log.Println("Creating note feed context menu")

	// Get the current sort preference
	pref, err := sort.GetSortPreference()
	if err != nil {
		log.Printf("Failed to get sort preference: %v", err)
		return contextMenu
	}

	log.Printf("Current sort preference: %v", pref)

	log.Printf("Current sort preference: %v", pref)

	var sortBySubMenu = contextMenu.AddSubmenu("Sort By")

	sortBySubMenu.AddCheckbox("Date Edited", pref.SortBy == "content_modified_at").OnClick(func(data *application.Context) {
		// Update sort preference
		log.Println("Updating sort preference")
		sort.UpdateSortPreference(pref.NotebookID, "content_modified_at", pref.SortOrder)
		// sortBySubMenu.FindByLabel("Date Edited").SetChecked(true)
		// sortBySubMenu.FindByLabel("Date Created").SetChecked(false)
		// sortBySubMenu.FindByLabel("Title").SetChecked(false)
		sortBySubMenu.Update()
		app.EmitEvent("myevent", "hello")
	})

	sortBySubMenu.AddCheckbox("Date Created", pref.SortBy == "created_at").OnClick(func(data *application.Context) {
		// Update sort preference
		sort.UpdateSortPreference(pref.NotebookID, "created_at", pref.SortOrder)
		// sortBySubMenu.FindByLabel("Date Edited").SetChecked(false)
		// sortBySubMenu.FindByLabel("Date Created").SetChecked(true)
		// sortBySubMenu.FindByLabel("Title").SetChecked(false)
		sortBySubMenu.Update()
		app.EmitEvent("myevent", "hello")
	})

	sortBySubMenu.AddCheckbox("Title", pref.SortBy == "title").OnClick(func(data *application.Context) {
		// Update sort preference
		sort.UpdateSortPreference(pref.NotebookID, "title", pref.SortOrder)
		// sortBySubMenu.FindByLabel("Date Edited").SetChecked(false)
		// sortBySubMenu.FindByLabel("Date Created").SetChecked(false)
		// sortBySubMenu.FindByLabel("Title").SetChecked(true)
		sortBySubMenu.Update()
		app.EmitEvent("myevent", "hello")
	})

	sortBySubMenu.AddSeparator()

	sortBySubMenu.AddCheckbox("Newest First", pref.SortOrder == "desc").OnClick(func(data *application.Context) {
		// Update sort preference
		sort.UpdateSortPreference(pref.NotebookID, pref.SortBy, "desc")
		app.EmitEvent("myevent", "hello")
	})

	sortBySubMenu.AddRadio("Oldest First", pref.SortOrder == "asc").OnClick(func(data *application.Context) {
		// Update sort preference
		sort.UpdateSortPreference(pref.NotebookID, pref.SortBy, "asc")
		app.EmitEvent("myevent", "hello")
	})

	app.OnEvent("notebook_changed", func(e *application.CustomEvent) {
		sortBySubMenu.Update()
		contextMenu.Update()

		app.Logger.Info("Event received", "payload", e.Data)
	})

	return contextMenu
}

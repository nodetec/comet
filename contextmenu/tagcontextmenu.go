package contextmenu

import (
	"context"
	"strconv"

	"github.com/nodetec/comet/service"
	"github.com/wailsapp/wails/v3/pkg/application"
)

func CreateTagMenu(app *application.App, mainWindow application.Window, ctx context.Context, tagService *service.TagService) {
	tagMenu := app.NewMenu()

	tagMenu.Add("Delete").OnClick(func(data *application.Context) {
		contextData, ok := data.ContextMenuData().(string)
		if !ok {
			app.Logger.Error("Invalid context menu data type")
			return
		}

		tagID, err := strconv.ParseInt(contextData, 10, 64)
		if err != nil {
			app.Logger.Error("Error converting context data to int64", "error", err)
			return
		}

		// Call your service method to delete the tag
		err = tagService.DeleteTag(ctx, tagID)
		if err != nil {
			app.Logger.Error("Error deleting tag", "error", err)
			return
		}

		// Emit an event to notify about tag deletion
		app.EmitEvent("tagDeleted", tagID)
	})

	mainWindow.RegisterContextMenu("tagMenu", tagMenu)
}

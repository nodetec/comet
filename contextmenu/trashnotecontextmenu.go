package contextmenu

import (
	"context"
	"strconv"

	"github.com/nodetec/captains-log/service"
	"github.com/wailsapp/wails/v3/pkg/application"
)

func CreateTrashNoteMenu(app *application.App, mainWindow application.Window, ctx context.Context, noteService *service.NoteService, noteTagService *service.NoteTagService) {
	trashNoteMenu := app.NewMenu()

	trashNoteMenu.Add("Delete").OnClick(func(data *application.Context) {
		contextData, ok := data.ContextMenuData().(string)
		if !ok {
			app.Logger.Error("Invalid context menu data type")
			return
		}

		trashNoteID, err := strconv.ParseInt(contextData, 10, 64)
		if err != nil {
			app.Logger.Error("Error converting context data to int64", "error", err)
			return
		}

		err = noteService.DeleteNoteFromTrash(ctx, trashNoteID)

		if err != nil {
			app.Logger.Error("Error deleting note", "error", err)
			return
		}

		// Emit an event to notify about note deletion
		app.Events.Emit(&application.WailsEvent{
			Name: "trashNoteDeleted",
			Data: trashNoteID,
		})
	})

	mainWindow.RegisterContextMenu("trashNoteMenu", trashNoteMenu)
}

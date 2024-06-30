package contextmenu

import (
	"context"
	"strconv"

	"github.com/nodetec/captains-log/service"
	"github.com/wailsapp/wails/v3/pkg/application"
)

func CreateNoteMenu(app *application.App, mainWindow application.Window, ctx context.Context, noteService *service.NoteService) {
	noteMenu := app.NewMenu()

	noteMenu.Add("Move to trash").OnClick(func(data *application.Context) {
		contextData, ok := data.ContextMenuData().(string)
		if !ok {
			app.Logger.Error("Invalid context menu data type")
			return
		}

		noteID, err := strconv.ParseInt(contextData, 10, 64)
		if err != nil {
			app.Logger.Error("Error converting context data to int64", "error", err)
			return
		}

		// Call your service method to delete the note
		err = noteService.DeleteNote(ctx, noteID)
		if err != nil {
			app.Logger.Error("Error deleting note", "error", err)
			return
		}

		// Emit an event to notify about note deletion
		app.Events.Emit(&application.WailsEvent{
			Name: "noteDeleted",
			Data: noteID,
		})
	})

	mainWindow.RegisterContextMenu("noteMenu", noteMenu)
}

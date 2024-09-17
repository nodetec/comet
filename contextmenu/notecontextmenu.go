package contextmenu

import (
	"context"
	"strconv"

	"github.com/nodetec/comet/service"
	"github.com/wailsapp/wails/v3/pkg/application"
)

func CreateNoteMenu(app *application.App, mainWindow application.Window, ctx context.Context, noteService *service.NoteService, noteTagService *service.NoteTagService) {
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
		note, err := noteService.GetNote(ctx, noteID)
		if err != nil {
			app.Logger.Error("Error getting note", "error", err)
		}
		tags, err := noteTagService.GetTagsForNote(ctx, noteID)
		if err != nil {
			app.Logger.Error("Error getting tags for note", "error", err)
		}
		err = noteService.AddNoteToTrash(ctx, note, tags)
		if err != nil {
			app.Logger.Error("Error moving note to trash", "error", err)
		}
		err = noteService.DeleteNote(ctx, noteID)

		if err != nil {
			app.Logger.Error("Error deleting note", "error", err)
			return
		}

		app.EmitEvent("noteDeleted", noteID)
	})

	noteMenu.Add("Move to Notebook").OnClick(func(data *application.Context) {
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

		note, err := noteService.GetNote(ctx, noteID)
		if err != nil {
			app.Logger.Error("Error getting note", "error", err)
		}

		app.EmitEvent("noteBookModal", note)
	})

	mainWindow.RegisterContextMenu("noteMenu", noteMenu)
}

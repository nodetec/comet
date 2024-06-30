package contextmenu

import (
	"context"
	"fmt"
	"strconv"
	"strings"

	"github.com/nodetec/captains-log/service"
	"github.com/wailsapp/wails/v3/pkg/application"
)

func CreateNoteTagMenu(app *application.App, mainWindow application.Window, ctx context.Context, noteTagService *service.NoteTagService) {
	noteTagMenu := app.NewMenu()

	noteTagMenu.Add("Remove").OnClick(func(data *application.Context) {
		contextData, ok := data.ContextMenuData().(string)
		fmt.Println("Context data!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!:", contextData)
		if !ok {
			app.Logger.Error("Invalid context menu data type")
			return
		}
		fmt.Println("Context data:", contextData)

		// parse {noteID}-{tagID}
		noteTagData := contextData
		noteTagDataSplit := strings.Split(noteTagData, ":")
		if len(noteTagDataSplit) != 2 {
			app.Logger.Error("Invalid context menu data format")
			return
		}

		noteID, err := strconv.Atoi(noteTagDataSplit[0])
		if err != nil {
			app.Logger.Error("Invalid note ID", "error", err)
			return
		}

		tagID, err := strconv.Atoi(noteTagDataSplit[1])
		if err != nil {
			app.Logger.Error("Invalid tag ID", "error", err)
			return
		}

		// Call your service method to delete the tag
		err = noteTagService.RemoveTagFromNote(ctx, int64(noteID), int64(tagID))
		if err != nil {
			app.Logger.Error("Error deleting tag", "error", err)
			return
		}

		// Emit an event to notify about tag deletion
		app.Events.Emit(&application.WailsEvent{
			Name: "noteTagRemoved",
			Data: tagID,
		})
	})

	mainWindow.RegisterContextMenu("noteTagMenu", noteTagMenu)
}

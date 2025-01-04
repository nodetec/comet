package menus

import (
	"comet/backend/models"
	"comet/backend/service/notes"
	"encoding/json"

	"github.com/wailsapp/wails/v3/pkg/application"
)

func CreateNoteCardContextMenu(app *application.App) *application.Menu {
	contextMenu := app.NewMenu()
	contextMenu.Add("Trash").OnClick(func(data *application.Context) {
		contextMenuData := data.ContextMenuData()
		app.Logger.Info("Context menu data", "data", contextMenuData)
		if contextMenuData == nil {
			app.Logger.Error("Context menu data is nil")
			return
		}
		contextMenuDataStr, ok := contextMenuData.(string)
		if !ok {
			app.Logger.Error("Failed to assert context menu data to string")
			return
		}
		contextMenuDataBytes := []byte(contextMenuDataStr)
		var note models.Note
		err := json.Unmarshal(contextMenuDataBytes, &note)
		if err != nil {
			app.Logger.Error("Failed to unmarshal context menu data", "error", err)
			return
		}
		err = notes.TrashNote(note.ID)
		if err != nil {
			app.Logger.Error("Failed to trash note", "error", err)
			return
		}
		app.EmitEvent("note_trashed", note.ID)
		app.Logger.Info("Note trashed", "note", note)
	})
	return contextMenu
}

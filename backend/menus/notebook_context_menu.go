package menus

import (
	"comet/backend/models"
	"comet/backend/service/notebooks"
	"encoding/json"

	"github.com/wailsapp/wails/v3/pkg/application"
)

func CreateNotebookContextMenu(app *application.App) *application.Menu {
	contextMenu := app.NewMenu()
	contextMenu.Add("Delete").OnClick(func(data *application.Context) {
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
		var notebook models.Notebook
		err := json.Unmarshal(contextMenuDataBytes, &notebook)
		if err != nil {
			app.Logger.Error("Failed to unmarshal context menu data", "error", err)
			return
		}
		err = notebooks.DeleteNotebook(notebook.ID)
		if err != nil {
			app.Logger.Error("Failed to restore notebook", "error", err)
			return
		}
		if notebook.Active {
			app.EmitEvent("active_notebook_deleted", notebook.ID)
		} else {
			app.EmitEvent("notebook_deleted", notebook.ID)
		}
		app.Logger.Info("Notebook deleted", "notebook", notebook)
	})
	return contextMenu
}

package contextmenu

import (
	"context"
	"database/sql"
	"strconv"
	"strings"

	"github.com/nodetec/captains-log/service"
	"github.com/wailsapp/wails/v3/pkg/application"
)

func CreateTrashNoteMenu(app *application.App, mainWindow application.Window, ctx context.Context, noteService *service.NoteService, noteTagService *service.NoteTagService, tagService *service.TagService) {
	trashNoteMenu := app.NewMenu()

	trashNoteMenu.Add("Restore from trash").OnClick(func(data *application.Context) {
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

		trashNote, err := noteService.GetNoteFromTrash(ctx, trashNoteID)
		if err != nil {
			app.Logger.Error("Error getting note from trash", "error", err)
		}
		var noteId = trashNote.NoteID
		var tagNamesArray []string
		if trashNote.Tags.Valid {
			tagNamesArray = strings.Split(trashNote.Tags.String, ",")
		}

		tags, err := tagService.GetTagsByNames(ctx, tagNamesArray)
		if err != nil {
			app.Logger.Error("Error getting tags for note restore", "error", err)
		}
		var tagIds []int64

		// Iterate through the slice of tags and extract IDs
		for _, tag := range tags {
			tagIds = append(tagIds, tag.ID)
		}

		noteId, content, title, createdAt, modifiedAt, notebookId, publishedAt, eventId, noteType, fileType := trashNote.NoteID, trashNote.Content, trashNote.Title, trashNote.CreatedAt, trashNote.ModifiedAt, trashNote.NotebookID, trashNote.PublishedAt, trashNote.EventID, trashNote.Notetype, trashNote.Filetype
		var statusId sql.NullInt64
		statusId.Valid = false
		note, err := noteService.RestoreNoteFromTrash(ctx, noteId, title, content, notebookId, statusId, createdAt, modifiedAt, publishedAt, eventId, noteType, fileType, tagIds)
		if err != nil {
			app.Logger.Error("Error moving note to trash", "error", err)
			app.Logger.Error("Note Id", "error", note.ID)
		}

		err = noteService.DeleteNoteFromTrash(ctx, trashNoteID)

		if err != nil {
			app.Logger.Error("Error deleting note from trash", "error", err)
			return
		}

		// Emit an event to notify about note restoration
		app.Events.Emit(&application.WailsEvent{
			Name: "noteRestored",
			Data: trashNoteID,
		})
	})

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

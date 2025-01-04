package service

import (
	"comet/backend/models"
	"comet/backend/service/notebooks"
	"comet/backend/service/notes"
	"comet/backend/service/relays"
	"comet/backend/service/tags"
	"comet/backend/service/users"
)

type AppService struct{}

// CreateNote inserts a new note into the database and returns the created note
func (s *AppService) CreateNote(title, content string) (*models.Note, error) {
	return notes.CreateNote(title, content) // Use notes package
}

// GetNotes retrieves all notes from the database with specified ordering, limit, offset, search, and trashed filter
func (s *AppService) GetNotes(orderBy string, orderDirection string, limit int, offset int, search string, showTrashed bool) ([]models.Note, error) {
	return notes.GetNotes(orderBy, orderDirection, limit, offset, search, showTrashed) // Use notes package
}

// GetNoteByID retrieves a single note by its ID
func (s *AppService) GetNoteByID(id int) (*models.Note, error) {
	return notes.GetNoteByID(id) // Use notes package
}

// UpdateNote updates the content and title of an existing note
func (s *AppService) UpdateNote(note models.Note) error {
	return notes.UpdateNote(note) // Use notes package
}

// DeleteNote deletes a note by its ID
func (s *AppService) DeleteNote(id int) error {
	return notes.DeleteNote(id) // Use notes package
}

// PinNote pins a note by its ID
func (s *AppService) PinNote(id int) error {
	return notes.PinNote(id) // Use notes package
}

// UnpinNote unpins a note by its ID
func (s *AppService) UnpinNote(id int) error {
	return notes.UnpinNote(id) // Use notes package
}

// TrashNote moves a note to the trash by its ID
func (s *AppService) TrashNote(id int) error {
	return notes.TrashNote(id) // Use notes package
}

// RestoreNote restores a note from the trash by its ID
func (s *AppService) RestoreNote(id int) error {
	return notes.RestoreNote(id) // Use notes package
}

// SetActiveNote sets the specified note as active and deactivates all other notes
func (s *AppService) SetActiveNote(noteID int) error {
	return notes.SetActiveNote(noteID) // Use notes package
}

// ClearActiveNote deactivates all active notes
func (s *AppService) ClearActiveNote() error {
	return notes.ClearActiveNote() // Use notes package
}

// GetActiveNote retrieves the active note from the database
func (s *AppService) GetActiveNote() (*models.Note, error) {
	return notes.GetActiveNote() // Use notes package
}

// SetPublishDetails updates the author, identifier, and published_at fields of a note
func (s *AppService) SetPublishDetails(noteID int, author, identifier, publishedAt string) error {
	return notes.SetPublishDetails(noteID, author, identifier, publishedAt) // Use notes package
}

// RemoveNoteTags removes all tag associations for a given note ID
func (s *AppService) RemoveNoteTags(noteID int) error {
	return tags.RemoveNoteTags(noteID) // Use tags package
}

// CreateTag inserts a new tag into the database
func (s *AppService) CreateTag(name, color, icon string, active bool, inactive bool) error {
	return tags.CreateTag(name, color, icon, active, inactive) // Use tags package
}

// CreateTags inserts multiple tags into the database
func (s *AppService) CreateTags(noteId int, tagList []string) error {
	return tags.CreateTags(noteId, tagList) // Use tags package
}

// GetTags retrieves all tags from the database
func (s *AppService) GetTags() ([]models.Tag, error) {
	return tags.GetTags() // Use tags package
}

// UpdateTag updates the details of an existing tag
func (s *AppService) UpdateTag(id int, name, color, icon string) error {
	return tags.UpdateTag(id, name, color, icon) // Use tags package
}

// DeleteTag deletes a tag by its ID
func (s *AppService) DeleteTag(id int) error {
	return tags.DeleteTag(id) // Use tags package
}

// GetTagByID retrieves a single tag by its ID
func (s *AppService) GetTagByID(id int) (*models.Tag, error) {
	return tags.GetTagByID(id) // Use tags package
}

// SetTagActive sets the active status of a tag to true
func (s *AppService) SetTagActive(tagID int, active bool) error {
	return tags.SetTagActive(tagID, active) // Use tags package
}

// SetTagInactive sets the active status of a tag to false
func (s *AppService) SetTagInactive(tagID int) error {
	return tags.SetTagInactive(tagID) // Use tags package
}

// ClearActiveTags sets the active status of all tags to false
func (s *AppService) ClearActiveTags() error {
	return tags.ClearActiveTags() // Use tags package
}

// GetTagsByNoteID retrieves all tags associated with a specific note ID
func (s *AppService) GetTagsByNoteID(noteID int) ([]models.Tag, error) {
	return tags.GetTagsByNoteID(noteID) // Use tags package
}

// CreateNotebook inserts a new notebook into the database
func (s *AppService) CreateNotebook(name string) error {
	return notebooks.CreateNotebook(name) // Use notebooks package
}

// GetNotebooks retrieves all notebooks from the database
func (s *AppService) GetNotebooks(pinned bool) ([]models.Notebook, error) {
	return notebooks.GetNotebooks(pinned) // Use notebooks package
}

// UpdateNotebook updates the details of an existing notebook
func (s *AppService) UpdateNotebook(id int, name string) error {
	return notebooks.UpdateNotebook(id, name) // Use notebooks package
}

// DeleteNotebook deletes a notebook by its ID
func (s *AppService) DeleteNotebook(id int) error {
	return notebooks.DeleteNotebook(id) // Use notebooks package
}

// GetNotebookByID retrieves a single notebook by its ID
func (s *AppService) GetNotebookByID(id int) (*models.Notebook, error) {
	return notebooks.GetNotebookByID(id) // Use notebooks package
}

// CheckNotebookExists checks if a notebook with the given name already exists in the database
func (s *AppService) CheckNotebookExists(name string) (bool, error) {
	return notebooks.CheckNotebookExists(name) // Use notebooks package
}

// SetNotebookActive sets a notebook to active by its ID
func (s *AppService) SetNotebookActive(id int) error {
	return notebooks.SetNotebookActive(id) // Use notebooks package
}

// ClearActiveNotebooks sets all notebooks to not active
func (s *AppService) ClearActiveNotebooks() error {
	return notebooks.ClearActiveNotebooks() // Use notebooks package
}

// GetActiveNotebook retrieves the active notebook from the database
func (s *AppService) GetActiveNotebook() (*models.Notebook, error) {
	return notebooks.GetActiveNotebook() // Use notebooks package
}

// ShowNotebook sets the pinned_at to the current timestamp to show the notebook
func (s *AppService) ShowNotebook(id int) error {
	return notebooks.ShowNotebook(id) // Use notebooks package
}

// HideNotebook sets the pinned_at to NULL to hide the notebook
func (s *AppService) HideNotebook(id int) error {
	return notebooks.HideNotebook(id) // Use notebooks package
}

// CreateUser inserts a new user into the database
func (s *AppService) CreateUser(nsec, npub string, active bool) (*models.User, error) {
	return users.CreateUser(nsec, npub, active) // Use users package
}

// GetUserByID retrieves a single user by its ID
func (s *AppService) GetUserByID(id int) (*models.User, error) {
	return users.GetUserByID(id) // Use users package
}

// UpdateUser updates the details of an existing user
func (s *AppService) UpdateUser(user models.User) error {
	return users.UpdateUser(user) // Use users package
}

// DeleteUser deletes a user by its ID
func (s *AppService) DeleteUser(id int) error {
	return users.DeleteUser(id) // Use users package
}

// GetActiveUser retrieves the active user from the database
func (s *AppService) GetActiveUser() (*models.User, error) {
	return users.GetActiveUser() // Use users package
}

// CreateRelay inserts a new relay into the database and returns the created relay
func (s *AppService) CreateRelay(url string, read, write, sync bool) (*models.Relay, error) {
	return relays.CreateRelay(url, read, write, sync) // Use relays package
}

// GetRelayByID retrieves a relay by its ID
func (s *AppService) GetRelayByID(id int) (*models.Relay, error) {
	return relays.GetRelayByID(id) // Use relays package
}

// UpdateRelay updates an existing relay in the database
func (s *AppService) UpdateRelay(relay models.Relay) error {
	return relays.UpdateRelay(relay) // Use relays package
}

// DeleteRelay deletes a relay by its ID
func (s *AppService) DeleteRelay(id int) error {
	return relays.DeleteRelay(id) // Use relays package
}

// GetAllRelays retrieves all relays from the database
func (s *AppService) GetAllRelays() ([]*models.Relay, error) {
	return relays.GetAllRelays() // Use relays package
}

// ReplaceRelays removes all existing relays and inserts the new list of relays into the database
func (s *AppService) ReplaceRelays(relayData []relays.RelayData) ([]*models.Relay, error) {
	return relays.ReplaceRelays(relayData) // Use relays package
}

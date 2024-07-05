package service

import (
	"context"
	"database/sql"
	"log"
	"strings"
	"time"

	"github.com/nodetec/captains-log/db"
)

type NoteService struct {
	queries *db.Queries
	logger  *log.Logger
}

func NewNoteService(queries *db.Queries, logger *log.Logger) *NoteService {
	return &NoteService{
		queries: queries,
		logger:  logger,
	}
}

func (s *NoteService) CreateNote(ctx context.Context, title string, content string, notebookID int64, statusID sql.NullInt64, publishedAt sql.NullString, eventId sql.NullString) (db.Note, error) {

	params := db.CreateNoteParams{
		Title:       title,
		Content:     content,
		NotebookID:  notebookID,
		StatusID:    statusID,
		CreatedAt:   time.Now().Format(time.RFC3339),
		ModifiedAt:  time.Now().Format(time.RFC3339),
		PublishedAt: publishedAt,
		EventID:     eventId,
	}

	note, err := s.queries.CreateNote(ctx, params)
	if err != nil {
		s.logger.Println("Error creating note:", err)
		return db.Note{}, err
	}
	return note, nil
}

func (s *NoteService) GetNote(ctx context.Context, id int64) (db.Note, error) {
	note, err := s.queries.GetNote(ctx, id)
	if err != nil {
		s.logger.Println("Error getting note:", err)
		return db.Note{}, err
	}
	return note, nil
}

func (s *NoteService) ListNotes(ctx context.Context, notebookId int64, tagId int64, limit, pageParam int64, orderBy string, sortDirection string) ([]db.Note, error) {
	offset := pageParam * limit

	var notes []db.Note
	var err error

	if notebookId != 0 && tagId != 0 {
		notes, err = s.queries.ListNotesByNotebookAndTag(ctx,
			notebookId,
			tagId,
			limit,
			offset,
			orderBy,
			sortDirection,
		)
	}

	if notebookId != 0 && tagId == 0 {
		notes, err = s.queries.ListNotesByNotebook(ctx,
			notebookId,
			limit,
			offset,
			orderBy,
			sortDirection,
		)
	}

	if notebookId == 0 && tagId != 0 {
		notes, err = s.queries.GetNotesForTag(ctx,
			tagId,
			limit,
			offset,
			orderBy,
			sortDirection,
		)
	}

	if notebookId == 0 && tagId == 0 {
		notes, err = s.queries.ListAllNotes(ctx,
			limit,
			offset,
			orderBy,
			sortDirection,
		)
	}

	if err != nil {
		s.logger.Println("Error listing notes :", err)
		return []db.Note{}, err
	}

	return notes, nil
}

func (s *NoteService) UpdateNote(ctx context.Context, id int64, title string, content string, notebookID int64, statusID sql.NullInt64, published bool, eventId sql.NullString) error {

	var publishedAt sql.NullString

	if published {
		publishedAt = sql.NullString{String: time.Now().Format(time.RFC3339), Valid: true}
	} else {
		publishedAt = sql.NullString{String: "", Valid: false}
	}

	params := db.UpdateNoteParams{
		ID:          id,
		Title:       title,
		Content:     content,
		NotebookID:  notebookID,
		StatusID:    statusID,
		ModifiedAt:  time.Now().Format(time.RFC3339),
		PublishedAt: publishedAt,
		EventID:     eventId,
	}

	err := s.queries.UpdateNote(ctx, params)
	if err != nil {
		s.logger.Println("Error updating note:", err)
		return err
	}
	return nil
}

func (s *NoteService) DeleteNote(ctx context.Context, id int64) error {
	err := s.queries.DeleteNote(ctx, id)
	if err != nil {
		s.logger.Println("Error deleting note:", err)
		return err
	}
	return nil
}

// Trash-related methods

func (s *NoteService) AddNoteToTrash(ctx context.Context, note db.Note, tags []db.Tag) error {
	var builder strings.Builder

	for i, tag := range tags {
		if i > 0 {
			builder.WriteString(",")
		}
		builder.WriteString(tag.Name)
	}

	stringifiedTags := builder.String()

	params := db.AddNoteToTrashParams{
		NoteID:     note.ID,
		Content:    note.Content,
		Title:      note.Title,
		CreatedAt:  note.CreatedAt,
		ModifiedAt: time.Now().Format(time.RFC3339),
		Tags:       sql.NullString{String: stringifiedTags, Valid: true},
	}
	_, err := s.queries.AddNoteToTrash(ctx, params)
	if err != nil {
		s.logger.Printf("Error adding note to trash: %v", err)
		return err
	}
	return nil
}

func (s *NoteService) GetNoteFromTrash(ctx context.Context, id int64) (db.Trash, error) {
	trash, err := s.queries.GetNoteFromTrash(ctx, id)
	if err != nil {
		s.logger.Printf("Error getting note from trash with ID %d: %v", id, err)
		return db.Trash{}, err
	}
	return trash, nil
}

func (s *NoteService) ListNotesFromTrash(ctx context.Context, limit, pageParam int64, orderBy string, sortDirection string) ([]db.Trash, error) {
	offset := pageParam * limit
	trash, err := s.queries.ListNotesFromTrash(ctx,
		limit,
		offset,
		orderBy,
		sortDirection,
	)
	if err != nil {
		s.logger.Printf("Error listing notes from trash: %v", err)
		return nil, err
	}
	return trash, nil
}

func (s *NoteService) DeleteNoteFromTrash(ctx context.Context, id int64) error {
	err := s.queries.DeleteNoteFromTrash(ctx, id)
	if err != nil {
		s.logger.Printf("Error deleting note from trash with ID %d: %v", id, err)
		return err
	}
	return nil
}

func (s *NoteService) SearchNotes(ctx context.Context, searchTerm string, notebookID, tagID int64, limit, pageParam int64, orderBy string, sortDirection string) ([]db.Note, error) {
	offset := pageParam * limit
	notes, err := s.queries.SearchNotes(ctx, searchTerm, notebookID, tagID, limit, offset, orderBy, sortDirection)
	if err != nil {
		return nil, err
	}
	return notes, nil
}

func (s *NoteService) SearchTrash(ctx context.Context, searchTerm string, limit, pageParam int64, orderBy string, sortDirection string) ([]db.Trash, error) {
	offset := pageParam * limit
	notes, err := s.queries.SearchTrash(ctx, searchTerm, limit, offset, orderBy, sortDirection)
	if err != nil {
		return nil, err
	}
	return notes, nil
}

package service

import (
	"context"
	"log"

	"github.com/nodetec/captains-log/db"
)

type NoteService struct {
	queries *db.Queries
	logger  *log.Logger
}

type PaginatedNotes struct {
	Notes      []db.Note `json:"notes"`
	NextOffset int64     `json:"next_offset"`
	PrevOffset int64     `json:"prev_offset"`
}

func NewNoteService(queries *db.Queries, logger *log.Logger) *NoteService {
	return &NoteService{
		queries: queries,
		logger:  logger,
	}
}

func (s *NoteService) CreateNote(ctx context.Context, params db.CreateNoteParams) (db.Note, error) {
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

func (s *NoteService) ListNotes(ctx context.Context, limit, offset int64) (PaginatedNotes, error) {
	notes, err := s.queries.ListNotes(ctx, db.ListNotesParams{
		Limit:  limit,
		Offset: offset,
	})
	if err != nil {
		s.logger.Println("Error listing notes:", err)
		return PaginatedNotes{}, err
	}

	nextOffset := offset + limit
	prevOffset := offset - limit

	if len(notes) < int(limit) {
		nextOffset = -1
	}

	if prevOffset < 0 {
		prevOffset = 0
	}

	return PaginatedNotes{
		Notes:      notes,
		NextOffset: nextOffset,
		PrevOffset: prevOffset,
	}, nil

}

func (s *NoteService) UpdateNote(ctx context.Context, params db.UpdateNoteParams) error {
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


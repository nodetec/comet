package service

import (
	"context"
	"database/sql"
	"log"

	"github.com/nodetec/captains-log/db"
)

type NoteTagService struct {
	queries *db.Queries
	logger  *log.Logger
}

func NewNoteTagService(queries *db.Queries, logger *log.Logger) *NoteTagService {
	return &NoteTagService{
		queries: queries,
		logger:  logger,
	}
}

func (s *NoteTagService) AddTagToNote(ctx context.Context, noteID, tagID int64) error {
	err := s.queries.AddTagToNote(ctx, db.AddTagToNoteParams{
		NoteID: sql.NullInt64{Int64: noteID, Valid: true},
		TagID:  sql.NullInt64{Int64: tagID, Valid: true},
	})
	if err != nil {
		s.logger.Println("Error adding tag to note:", err)
		return err
	}
	return nil
}

// func (s *NoteTagService) GetNotesForTag(ctx context.Context, tagID, limit, pageParam int64) ([]db.Note, error) {
//   offset := pageParam * limit
// 	notes, err := s.queries.GetNotesForTag(ctx, db.GetNotesForTagParams{
// 		TagID:  sql.NullInt64{Int64: tagID, Valid: true},
// 		Limit:  limit,
// 		Offset: offset,
// 	})
// 	if err != nil {
// 		s.logger.Println("Error getting notes for tag:", err)
// 		return nil, err
// 	}
// 	return notes, nil
// }

func (s *NoteTagService) GetTagsForNote(ctx context.Context, noteID int64) ([]db.Tag, error) {
	tags, err := s.queries.GetTagsForNote(ctx, sql.NullInt64{Int64: noteID, Valid: true})
	if err != nil {
		s.logger.Println("Error getting tags for note:", err)
		return nil, err
	}
	return tags, nil
}

func (s *NoteTagService) RemoveTagFromNote(ctx context.Context, noteID, tagID int64) error {
	err := s.queries.RemoveTagFromNote(ctx, db.RemoveTagFromNoteParams{
		NoteID: sql.NullInt64{Int64: noteID, Valid: true},
		TagID:  sql.NullInt64{Int64: tagID, Valid: true},
	})
	if err != nil {
		s.logger.Println("Error removing tag from note:", err)
		return err
	}
	return nil
}

func (s *NoteTagService) CheckTagForNote(ctx context.Context, noteID, tagID int64) (bool, error) {
	isAssociated, err := s.queries.CheckTagForNote(ctx, db.CheckTagForNoteParams{
		NoteID: sql.NullInt64{Int64: noteID, Valid: true},
		TagID:  sql.NullInt64{Int64: tagID, Valid: true},
	})
	if err != nil {
		s.logger.Println("Error checking if tag is associated with note:", err)
		return false, err
	}
	return isAssociated, nil
}

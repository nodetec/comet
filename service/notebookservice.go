package service

import (
	"context"
	"log"
	"time"

	"github.com/nodetec/captains-log/db"
)

type NotebookService struct {
	queries *db.Queries
	logger  *log.Logger
}

func NewNotebookService(queries *db.Queries, logger *log.Logger) *NotebookService {
	return &NotebookService{
		queries: queries,
		logger:  logger,
	}
}

func (s *NotebookService) CreateNotebook(ctx context.Context, name string) (db.Notebook, error) {
	createdAt := time.Now().Format(time.RFC3339)
	params := db.CreateNotebookParams{
		Name:      name,
		CreatedAt: createdAt,
	}
	notebook, err := s.queries.CreateNotebook(ctx, params)
	if err != nil {
		s.logger.Printf("Error creating notebook: %v", err)
		return db.Notebook{}, err
	}
	return notebook, nil
}

func (s *NotebookService) GetNotebook(ctx context.Context, id int64) (db.Notebook, error) {
	notebook, err := s.queries.GetNotebook(ctx, id)
	if err != nil {
		s.logger.Printf("Error getting notebook with ID %d: %v", id, err)
		return db.Notebook{}, err
	}
	return notebook, nil
}

func (s *NotebookService) ListNotebooks(ctx context.Context) ([]db.Notebook, error) {
	notebooks, err := s.queries.ListNotebooks(ctx)
	if err != nil {
		s.logger.Printf("Error listing notebooks: %v", err)
		return nil, err
	}
	return notebooks, nil
}

func (s *NotebookService) UpdateNotebook(ctx context.Context, id int64, name, createdAt string) error {
	params := db.UpdateNotebookParams{
		Name:      name,
		CreatedAt: createdAt,
		ID:        id,
	}
	err := s.queries.UpdateNotebook(ctx, params)
	if err != nil {
		s.logger.Printf("Error updating notebook with ID %d: %v", id, err)
		return err
	}
	return nil
}

func (s *NotebookService) DeleteNotebook(ctx context.Context, id int64) error {
	err := s.queries.DeleteNotebook(ctx, id)
	if err != nil {
		s.logger.Printf("Error deleting notebook with ID %d: %v", id, err)
		return err
	}
	return nil
}

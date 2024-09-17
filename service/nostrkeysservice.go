package service

import (
	"context"
	"log"
	"time"

	"github.com/nodetec/comet/db"
)

type NostrKey struct {
	ID       int64
	Nsec     string
	Npub     string
	Active   bool
}

type NostrKeyService struct {
	queries *db.Queries
	logger  *log.Logger
}

func NewNostrKeyService(queries *db.Queries, logger *log.Logger) *NostrKeyService {
	return &NostrKeyService{
		queries: queries,
		logger:  logger,
	}
}

func (s *NostrKeyService) CreateNostrKey(ctx context.Context, nsec string, npub string, active bool) (NostrKey, error) {
	params := db.CreateNostrKeyParams{
		Nsec:       nsec,
		Npub:       npub,
		Active:     active,
		CreatedAt:  time.Now().Format(time.RFC3339),
		ModifiedAt: time.Now().Format(time.RFC3339),
	}
	nostrKey, err := s.queries.CreateNostrKey(ctx, params)
	if err != nil {
		s.logger.Printf("Error creating relay: %v", err)
		return NostrKey{}, err
	}
	return NostrKey{
		ID:       nostrKey.ID,
		Nsec:     nostrKey.Nsec,
		Npub:     nostrKey.Npub,
		Active:   nostrKey.Active,
	}, nil
}

func (s *NostrKeyService) DeleteNostrKey(ctx context.Context, id int64) error {
	err := s.queries.DeleteNostrKey(ctx, id)
	if err != nil {
		s.logger.Printf("Error deleting tag with ID %d: %v", id, err)
		return err
	}
	return nil
}

func (s *NostrKeyService) GetNostrKey(ctx context.Context, id int64) (NostrKey, error) {
	nostrKey, err := s.queries.GetNostrKey(ctx, id)
	if err != nil {
		s.logger.Printf("Error getting tag with ID %d: %v", id, err)
		return NostrKey{}, err
	}
	return NostrKey{
		ID:       nostrKey.ID,
		Nsec:     nostrKey.Nsec,
		Npub:     nostrKey.Npub,
		Active:   nostrKey.Active,
	}, nil
}

func (s *NostrKeyService) ListNostrKeys(ctx context.Context) ([]NostrKey, error) {
	nostrKeys, err := s.queries.ListNostrKeys(ctx)
	if err != nil {
		s.logger.Printf("Error listing tags: %v", err)
		return nil, err
	}
	var result []NostrKey
	for _, nk := range nostrKeys {
		result = append(result, NostrKey{
			ID:       nk.ID,
			Nsec:     nk.Nsec,
			Npub:     nk.Npub,
			Active:   nk.Active,
		})
	}
	return result, nil
}

func (s *NostrKeyService) UpdateNostrKey(ctx context.Context, id int64, nsec string, npub string, active bool) error {
	params := db.UpdateNostrKeyParams{
		Nsec:       nsec,
		Npub:       npub,
		Active:     active,
		ModifiedAt: time.Now().Format(time.RFC3339),
	}
	err := s.queries.UpdateNostrKey(ctx, params)
	if err != nil {
		s.logger.Printf("Error updating tag with ID %d: %v", id, err)
		return err
	}
	return nil
}

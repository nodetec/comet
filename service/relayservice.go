package service

import (
	"context"
	"log"
	"time"

	"github.com/nodetec/comet/db"
)

type Relay struct {
	ID    int64
	Url   string
	Read  bool
	Write bool
	Sync  bool
}

type RelayService struct {
	queries *db.Queries
	logger  *log.Logger
}

func NewRelayService(queries *db.Queries, logger *log.Logger) *RelayService {
	return &RelayService{
		queries: queries,
		logger:  logger,
	}
}

func (s *RelayService) CreateRelay(ctx context.Context, url string, read bool, write bool, sync bool) (Relay, error) {
	params := db.CreateRelayParams{
		Url:        url,
		Read:       read,
		Write:      write,
		Sync:       sync,
		CreatedAt:  time.Now().Format(time.RFC3339),
		ModifiedAt: time.Now().Format(time.RFC3339),
	}
	relay, err := s.queries.CreateRelay(ctx, params)
	if err != nil {
		s.logger.Printf("Error creating relay: %v", err)
		return Relay{}, err
	}
	return Relay{
		ID:    relay.ID,
		Url:   relay.Url,
		Read:  relay.Read,
		Write: relay.Write,
		Sync:  relay.Sync,
	}, nil
}

func (s *RelayService) DeleteRelays(ctx context.Context) error {
	err := s.queries.DeleteRelays(ctx)
	if err != nil {
		s.logger.Printf("Error deleting relays: %v", err)
		return err
	}
	return nil
}

func (s *RelayService) GetRelay(ctx context.Context, id int64) (Relay, error) {
	relay, err := s.queries.GetRelay(ctx, id)
	if err != nil {
		s.logger.Printf("Error getting tag with ID %d: %v", id, err)
		return Relay{}, err
	}
	return Relay{
		ID:    relay.ID,
		Url:   relay.Url,
		Read:  relay.Read,
		Write: relay.Write,
		Sync:  relay.Sync,
	}, nil
}

func (s *RelayService) ListRelays(ctx context.Context) ([]Relay, error) {
	relays, err := s.queries.ListRelays(ctx)
	if err != nil {
		s.logger.Printf("Error listing tags: %v", err)
		return nil, err
	}
	var result []Relay
	for _, r := range relays {
		result = append(result, Relay{
			ID:    r.ID,
			Url:   r.Url,
			Read:  r.Read,
			Write: r.Write,
			Sync:  r.Sync,
		})
	}
	return result, nil
}

func (s *RelayService) UpdateRelay(ctx context.Context, id int64, url string, read bool, write bool, sync bool) error {
	params := db.UpdateRelayParams{
		ID:         id,
		Url:        url,
		Read:       read,
		Write:      write,
		Sync:       sync,
		ModifiedAt: time.Now().Format(time.RFC3339),
	}
	err := s.queries.UpdateRelay(ctx, params)
	if err != nil {
		s.logger.Printf("Error updating tag with ID %d: %v", id, err)
		return err
	}
	return nil
}

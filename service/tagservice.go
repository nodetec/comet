package service

import (
	"context"
	"database/sql"
	"log"

	"github.com/nodetec/captains-log/db"
)

type Tag struct {
	ID        int64
	Name      string
	Color     sql.NullString
	Icon      sql.NullString
	CreatedAt string
}

type TagService struct {
	queries *db.Queries
	logger  *log.Logger
}

func NewTagService(queries *db.Queries, logger *log.Logger) *TagService {
	return &TagService{
		queries: queries,
		logger:  logger,
	}
}

func (s *TagService) CreateTag(ctx context.Context, name string, color sql.NullString, icon sql.NullString, createdAt string) (Tag, error) {
	params := db.CreateTagParams{
		Name:      name,
		Color:     color,
		Icon:      icon,
		CreatedAt: createdAt,
	}
	tag, err := s.queries.CreateTag(ctx, params)
	if err != nil {
		s.logger.Printf("Error creating tag: %v", err)
		return Tag{}, err
	}
	return Tag{
		ID:        tag.ID,
		Name:      tag.Name,
		Color:     tag.Color,
		Icon:      tag.Icon,
		CreatedAt: tag.CreatedAt,
	}, nil
}

func (s *TagService) DeleteTag(ctx context.Context, id int64) error {
	err := s.queries.DeleteTag(ctx, id)
	if err != nil {
		s.logger.Printf("Error deleting tag with ID %d: %v", id, err)
		return err
	}
	return nil
}

func (s *TagService) GetTag(ctx context.Context, id int64) (Tag, error) {
	tag, err := s.queries.GetTag(ctx, id)
	if err != nil {
		s.logger.Printf("Error getting tag with ID %d: %v", id, err)
		return Tag{}, err
	}
	return Tag{
		ID:        tag.ID,
		Name:      tag.Name,
		Color:     tag.Color,
		Icon:      tag.Icon,
		CreatedAt: tag.CreatedAt,
	}, nil
}

func (s *TagService) GetTagByName(ctx context.Context, name string) (Tag, error) {
	tag, err := s.queries.GetTagByName(ctx, name)
	if err != nil {
		s.logger.Printf("Error getting tag with name %s: %v", name, err)
		return Tag{}, err
	}
	return Tag{
		ID:        tag.ID,
		Name:      tag.Name,
		Color:     tag.Color,
		Icon:      tag.Icon,
		CreatedAt: tag.CreatedAt,
	}, nil
}

func (s *TagService) ListTags(ctx context.Context) ([]Tag, error) {
	tags, err := s.queries.ListTags(ctx)
	if err != nil {
		s.logger.Printf("Error listing tags: %v", err)
		return nil, err
	}
	var result []Tag
	for _, t := range tags {
		result = append(result, Tag{
			ID:        t.ID,
			Name:      t.Name,
			Color:     t.Color,
			Icon:      t.Icon,
			CreatedAt: t.CreatedAt,
		})
	}
	return result, nil
}

func (s *TagService) UpdateTag(ctx context.Context, id int64, name string, color sql.NullString, icon sql.NullString, createdAt string) error {
	params := db.UpdateTagParams{
		ID:        id,
		Name:      name,
		Color:     color,
		Icon:      icon,
		CreatedAt: createdAt,
	}
	err := s.queries.UpdateTag(ctx, params)
	if err != nil {
		s.logger.Printf("Error updating tag with ID %d: %v", id, err)
		return err
	}
	return nil
}


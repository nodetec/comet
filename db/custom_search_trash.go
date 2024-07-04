package db

import (
	"context"
	"fmt"
)

func (q *Queries) SearchTrash(ctx context.Context, searchTerm string, limit, offset int64, orderBy, sortDirection string) ([]Note, error) {
	orderClause := "trash.id DESC"
	switch orderBy {
	case "modified_at":
		orderClause = fmt.Sprintf("trash.modified_at %s", sortDirection)
	case "created_at":
		orderClause = fmt.Sprintf("trash.created_at %s", sortDirection)
	case "title":
		orderClause = fmt.Sprintf("trash.title %s", sortDirection)
	default:
		orderClause = fmt.Sprintf("trash.id %s", sortDirection)
	}

	customSearchQuery := fmt.Sprintf(`
	SELECT DISTINCT trash.*
	FROM trash
	JOIN trash_fts ON trash.id = trash_fts.rowid
	WHERE trash_fts MATCH ? || '*'
	ORDER BY %s
	LIMIT ? OFFSET ?;
	`, orderClause)

	rows, err := q.db.QueryContext(ctx, customSearchQuery, searchTerm, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var notes []Note
	for rows.Next() {
		var note Note
		if err := rows.Scan(
			&note.ID,
			&note.StatusID,
			&note.NotebookID,
			&note.Content,
			&note.Title,
			&note.CreatedAt,
			&note.ModifiedAt,
			&note.PublishedAt,
			&note.EventID,
		); err != nil {
			return nil, err
		}
		notes = append(notes, note)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return notes, nil
}

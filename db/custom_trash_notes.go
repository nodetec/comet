package db

import (
	"context"
	"fmt"
)

func (q *Queries) ListNotesFromTrash(ctx context.Context, limit, offset int64, orderBy, sortDirection string) ([]Trash, error) {
	orderClause := "id DESC"
	switch orderBy {
	case "modified_at":
		orderClause = fmt.Sprintf("modified_at %s", sortDirection)
	case "created_at":
		orderClause = fmt.Sprintf("created_at %s", sortDirection)
	case "title":
		orderClause = fmt.Sprintf("title %s", sortDirection)
	default:
		orderClause = fmt.Sprintf("id %s", sortDirection)
	}

	query := fmt.Sprintf(`
	SELECT
		id,
		note_id,
		content,
		title,
		created_at,
		modified_at,
		tags
	FROM
		trash
	ORDER BY
		%s
	LIMIT
		?
	OFFSET
		?;`, orderClause)

	rows, err := q.db.QueryContext(ctx, query, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var notes []Trash
	for rows.Next() {
		var note Trash
		if err := rows.Scan(
			&note.ID,
			&note.NoteID,
			&note.Content,
			&note.Title,
			&note.CreatedAt,
			&note.ModifiedAt,
			&note.Tags,
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

package db

import (
	"context"
	"fmt"
)

func (q *Queries) GetNotesForTag(ctx context.Context, tagID, limit, offset int64, orderBy, sortDirection string) ([]Note, error) {
	orderClause := "n.modified_at DESC"
	switch orderBy {
	case "modified_at":
		orderClause = fmt.Sprintf("n.modified_at %s", sortDirection)
	case "created_at":
		orderClause = fmt.Sprintf("n.created_at %s", sortDirection)
	case "title":
		orderClause = fmt.Sprintf("n.title %s", sortDirection)
	default:
		orderClause = fmt.Sprintf("n.modified_at %s", sortDirection)
	}

	query := fmt.Sprintf(`
	SELECT
		n.id,
		n.status_id,
		n.notebook_id,
		n.content,
		n.title,
		n.created_at,
		n.modified_at,
		n.published_at,
		n.event_id
    n.pinned
	FROM
		notes n
		JOIN note_tags nt ON n.id = nt.note_id
	WHERE
		nt.tag_id = ?
	ORDER BY
		%s
	LIMIT
		?
	OFFSET
		?;`, orderClause)

	rows, err := q.db.QueryContext(ctx, query, tagID, limit, offset)
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
      &note.Pinned,
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

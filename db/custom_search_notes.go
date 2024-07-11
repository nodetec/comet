package db

import (
	"context"
	"fmt"
)

func (q *Queries) SearchNotes(ctx context.Context, searchTerm string, notebookID, tagID, limit, offset int64, orderBy, sortDirection string) ([]Note, error) {
	orderClause := "notes.id DESC"
	switch orderBy {
	case "modified_at":
		orderClause = fmt.Sprintf("notes.modified_at %s", sortDirection)
	case "created_at":
		orderClause = fmt.Sprintf("notes.created_at %s", sortDirection)
	case "title":
		orderClause = fmt.Sprintf("notes.title %s", sortDirection)
	default:
		orderClause = fmt.Sprintf("notes.id %s", sortDirection)
	}

	customSearchQuery := fmt.Sprintf(`
	SELECT DISTINCT notes.*
	FROM notes
	JOIN notes_fts ON notes.id = notes_fts.rowid
	LEFT JOIN note_tags ON notes.id = note_tags.note_id
	LEFT JOIN tags ON note_tags.tag_id = tags.id
	WHERE notes_fts MATCH ? || '*'
	AND (CASE WHEN ? != 0 THEN notes.notebook_id = ? ELSE 1 END)
	AND (CASE WHEN ? != 0 THEN tags.id = ? ELSE 1 END)
	ORDER BY %s
	LIMIT ? OFFSET ?;
	`, orderClause)

	rows, err := q.db.QueryContext(ctx, customSearchQuery, searchTerm, notebookID, notebookID, tagID, tagID, limit, offset)
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


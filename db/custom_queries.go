package db

import (
	"context"
)

const customSearchQuery = `
SELECT DISTINCT notes.*
FROM notes
JOIN notes_fts ON notes.id = notes_fts.rowid
LEFT JOIN note_tags ON notes.id = note_tags.note_id
LEFT JOIN tags ON note_tags.tag_id = tags.id
WHERE notes_fts MATCH ? || '*'
AND (CASE WHEN ? != 0 THEN notes.notebook_id = ? ELSE 1 END)
AND (CASE WHEN ? != 0 THEN tags.id = ? ELSE 1 END)
ORDER BY notes.id DESC
LIMIT ? OFFSET ?;
`

func (q *Queries) CustomSearch(ctx context.Context, searchTerm string, notebookID, tagID, limit, offset int64) ([]Note, error) {
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

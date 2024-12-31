package notes

import (
	"comet/backend/db"
	"comet/backend/db/schemas"
	"log"
	"regexp"
)

// RestoreNote restores a note from the trash by its ID
func RestoreNote(id int) error {
	tx, err := db.DB.Begin()
	if err != nil {
		log.Printf("Failed to begin transaction: %v", err)
		return err
	}

	// Restore the note
	_, err = tx.Exec("UPDATE notes SET trashed_at = NULL WHERE id = ?", id)
	if err != nil {
		tx.Rollback()
		log.Printf("Failed to restore note: %v", err)
		return err
	}

	// Get the note content and notebook ID
	var note schemas.Note
	err = tx.QueryRow("SELECT content, notebook_id FROM notes WHERE id = ?", id).Scan(&note.Content, &note.NotebookID)
	if err != nil {
		tx.Rollback()
		log.Printf("Failed to retrieve note content: %v", err)
		return err
	}

	// Extract tags from the content
	re := regexp.MustCompile(`#(\w+)`)
	matches := re.FindAllStringSubmatch(note.Content, -1)
	tags := make(map[string]bool)
	for _, match := range matches {
		tags[match[1]] = true
	}

	// Prepare statements for tag and association operations
	stmtTag, err := tx.Prepare("INSERT OR IGNORE INTO tags (name) VALUES (?)")
	if err != nil {
		tx.Rollback()
		log.Printf("Failed to prepare tag statement: %v", err)
		return err
	}
	defer stmtTag.Close()

	stmtNoteTag, err := tx.Prepare("INSERT OR IGNORE INTO notes_tags (note_id, tag_id) VALUES (?, ?)")
	if err != nil {
		tx.Rollback()
		log.Printf("Failed to prepare note-tag association statement: %v", err)
		return err
	}
	defer stmtNoteTag.Close()

	stmtNotebookTag, err := tx.Prepare("INSERT OR IGNORE INTO notebook_tags (notebook_id, tag_id) VALUES (?, ?)")
	if err != nil {
		tx.Rollback()
		log.Printf("Failed to prepare notebook-tag association statement: %v", err)
		return err
	}
	defer stmtNotebookTag.Close()

	// Process each tag
	for tag := range tags {
		_, err := stmtTag.Exec(tag)
		if err != nil {
			tx.Rollback()
			log.Printf("Failed to insert tag: %v", err)
			return err
		}

		var tagID int
		err = tx.QueryRow("SELECT id FROM tags WHERE name = ?", tag).Scan(&tagID)
		if err != nil {
			tx.Rollback()
			log.Printf("Failed to retrieve tag ID: %v", err)
			return err
		}

		_, err = stmtNoteTag.Exec(id, tagID)
		if err != nil {
			tx.Rollback()
			log.Printf("Failed to associate tag with note: %v", err)
			return err
		}

		if note.NotebookID != nil {
			_, err = stmtNotebookTag.Exec(*note.NotebookID, tagID)
			if err != nil {
				tx.Rollback()
				log.Printf("Failed to associate tag with notebook: %v", err)
				return err
			}
		}
	}

	err = tx.Commit()
	if err != nil {
		log.Printf("Failed to commit transaction: %v", err)
		return err
	}

	return nil
}

#[derive(Debug, thiserror::Error)]
pub enum NoteError {
    #[error("Note not found.")]
    NotFound,

    #[error("Note is read-only.")]
    ReadOnly,

    #[error("Invalid note id.")]
    InvalidNoteId,

    #[error("Invalid notebook id.")]
    InvalidNotebookId,

    #[error("Notebook not found.")]
    NotebookNotFound,

    #[error("Notebook name cannot be empty.")]
    EmptyNotebookName,

    #[error("Notebook name is too long.")]
    NotebookNameTooLong,

    #[error("A notebook with that name already exists.")]
    DuplicateNotebookName,

    #[error("{0}")]
    Storage(String),
}

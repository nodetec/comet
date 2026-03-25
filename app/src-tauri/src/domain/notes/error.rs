#[derive(Debug, thiserror::Error)]
pub enum NoteError {
    #[error("Note not found.")]
    NotFound,

    #[error("Note is read-only.")]
    ReadOnly,

    #[error("Invalid note id.")]
    InvalidNoteId,

    #[error("{0}")]
    Storage(String),
}

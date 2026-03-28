#[derive(Debug, thiserror::Error)]
pub enum NoteError {
    #[error("Note not found.")]
    NotFound,

    #[error("Note is read-only.")]
    ReadOnly,

    #[error("Invalid note id.")]
    InvalidNoteId,

    #[error("Invalid tag path.")]
    InvalidTagPath,

    #[error("Tag not found.")]
    TagNotFound,

    #[error("Only root tags can be pinned.")]
    TagNotPinnable,

    #[error("Invalid export input.")]
    InvalidExportInput,

    #[error("{0}")]
    Storage(String),
}

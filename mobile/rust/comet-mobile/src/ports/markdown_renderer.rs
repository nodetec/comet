#[allow(dead_code)]
/// Abstracts markdown-to-HTML rendering.
pub trait MarkdownRenderer: Send + Sync {
    fn render(&self, markdown: &str) -> String;
}

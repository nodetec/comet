//! Markdown → Lexical-compatible HTML renderer using comrak.
//!
//! Produces HTML that Lexical's `$generateNodesFromDOM` can consume directly,
//! matching the output of the marked.js pipeline in the frontend.

use comrak::options::{Extension, Options, Parse, Render};
use comrak::Arena;
use std::borrow::Cow;

/// Full pipeline: preprocess → parse → render → postprocess.
pub fn markdown_to_lexical_html(markdown: &str) -> String {
    let preprocessed = preprocess_blank_lines(markdown);

    let arena = Arena::new();
    let opts = options();
    let root = comrak::parse_document(&arena, &preprocessed, &opts);

    let mut html = String::with_capacity(markdown.len() * 2);
    comrak::format_html(root, &opts, &mut html).expect("HTML rendering failed");

    postprocess_html(&html)
}

fn options<'a>() -> Options<'a> {
    let mut options = Options::default();

    options.parse = Parse::default();

    options.extension = Extension::default();
    options.extension.strikethrough = true;
    options.extension.table = true;
    options.extension.tasklist = true;
    options.extension.autolink = true;
    options.extension.highlight = true;

    options.render = Render::default();
    options.render.hardbreaks = true; // Soft breaks → <br> (matches `breaks: true`)
    options.render.r#unsafe = true; // Allow raw HTML passthrough (for <p><br></p> markers)
    options.render.tasklist_classes = true; // Add contains-task-list / task-list-item classes

    options
}

/// Post-process the rendered HTML for Lexical compatibility.
fn postprocess_html(html: &str) -> String {
    let mut result = html.to_string();

    // Code blocks: rewrite nested <pre><code> into a bare <pre> so Lexical
    // imports a single CodeNode instead of traversing both elements.
    result = regex_lite::Regex::new(r#"<pre><code class="language-([^"]+)">"#)
        .unwrap()
        .replace_all(&result, r#"<pre data-language="$1">"#)
        .to_string();

    result = result.replace("<pre><code>", "<pre>");
    result = result.replace("</code></pre>", "</pre>");

    // Strikethrough: comrak uses <del>, Lexical expects <s>
    result = result.replace("<del>", "<s>").replace("</del>", "</s>");

    // YouTube: convert autolinked YouTube URLs into <iframe data-lexical-youtube="...">
    // so Lexical's YouTubeNode.importDOM can reconstruct embedded videos.
    // The markdown transformer exports YouTubeNodes as bare URLs, which comrak
    // autolinks into <a href="URL">URL</a>. We detect these self-links (text
    // starts with https://) and produce the iframe format YouTubeNode expects.
    result = regex_lite::Regex::new(
        r#"<a href="https://(?:www\.)?(?:youtube\.com/watch\?v=|youtu\.be/)([a-zA-Z0-9_-]{11})[^"]*">https?://[^<]+</a>"#,
    )
    .unwrap()
    .replace_all(
        &result,
        r#"<iframe data-lexical-youtube="$1" width="560" height="315" src="https://www.youtube-nocookie.com/embed/$1" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen="true" title="YouTube video"></iframe>"#,
    )
    .to_string();

    // Comrak 0.51+ adds contains-task-list, task-list-item, and
    // task-list-item-checkbox classes automatically. No post-processing needed.

    // Strip whitespace between block-level tags. DOMParser turns newlines between
    // tags (e.g. `</p>\n<pre>`, `</li>\n<li>`) into text nodes that Lexical wraps
    // in phantom empty paragraphs or list items.
    result = regex_lite::Regex::new(
        r#">\s+<(/?)(p|h[1-6]|ul|ol|li|pre|blockquote|table|thead|tbody|tr|th|td|hr|div|section)"#,
    )
    .unwrap()
    .replace_all(&result, "><$1$2")
    .to_string();

    result
}

/// Returns true if the line is only 1–6 `#` characters (with no trailing
/// content). Comrak treats these as empty ATX headings, but we want them
/// rendered as literal text so they survive editor round-trips.
fn is_bare_heading_line(line: &str) -> bool {
    let bytes = line.as_bytes();
    let len = bytes.len();
    len >= 1 && len <= 6 && bytes.iter().all(|&b| b == b'#')
}

/// Preprocess blank lines into `<p><br></p>` markers, matching the frontend's
/// `emptyParagraphPreprocess` hook.
///
/// Also escapes bare hash lines (`#`, `##`, …) so comrak treats them as
/// literal text instead of empty headings.
///
/// First blank line in a group = standard block separator.
/// Each additional blank = empty paragraph marker.
fn preprocess_blank_lines(markdown: &str) -> String {
    let lines: Vec<&str> = markdown.split('\n').collect();
    let mut result: Vec<Cow<'_, str>> = Vec::with_capacity(lines.len());
    let mut fence_char: Option<u8> = None;
    let mut fence_len: usize = 0;
    let mut i = 0;

    while i < lines.len() {
        let line = lines[i];
        let trimmed = line.trim_start().as_bytes();

        // Track code fence state
        if !trimmed.is_empty() && (trimmed[0] == b'`' || trimmed[0] == b'~') {
            let ch = trimmed[0];
            let len = trimmed.iter().take_while(|&&b| b == ch).count();
            if len >= 3 {
                // Skip single-line fenced code (```code```)
                let is_single_line = ch == b'`' && {
                    let rest = &line.trim_start()[len..];
                    rest.contains('`')
                        && rest.rfind('`').map_or(false, |p| {
                            let trailing = rest[p..].bytes().take_while(|&b| b == b'`').count();
                            trailing >= len && p > 0
                        })
                };
                if !is_single_line {
                    if let Some(fc) = fence_char {
                        if ch == fc && len >= fence_len {
                            fence_char = None;
                        }
                    } else {
                        fence_char = Some(ch);
                        fence_len = len;
                    }
                    result.push(Cow::Borrowed(line));
                    i += 1;
                    continue;
                }
            }
        }

        // Inside code fence — preserve as-is
        if fence_char.is_some() {
            result.push(Cow::Borrowed(line));
            i += 1;
            continue;
        }

        // Blank line group
        if line.trim().is_empty() {
            let mut blank_count = 0;
            while i < lines.len() && lines[i].trim().is_empty() {
                blank_count += 1;
                i += 1;
            }
            // First blank = standard separator
            result.push(Cow::Borrowed(""));
            // Additional blanks = empty paragraphs
            for _ in 1..blank_count {
                result.push(Cow::Borrowed("<p><br></p>"));
                result.push(Cow::Borrowed(""));
            }
        } else if is_bare_heading_line(line) {
            // Escape bare hash lines so comrak renders them as text
            result.push(Cow::Owned(format!(r"\{}", line)));
            i += 1;
        } else {
            result.push(Cow::Borrowed(line));
            i += 1;
        }
    }

    result.join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_bare_hashes_stay_as_text() {
        // A lone "#" or "##" etc. without trailing text or space should be text, not headings
        let html = markdown_to_lexical_html("#");
        assert!(html.contains("<p>"), "Bare # should be paragraph. HTML: {html}");
        assert!(html.contains("#"), "HTML: {html}");
        assert!(!html.contains("<h1>"), "Bare # should NOT be heading. HTML: {html}");

        let html = markdown_to_lexical_html("##");
        assert!(!html.contains("<h2>"), "Bare ## should NOT be heading. HTML: {html}");
        assert!(html.contains("<p>"), "HTML: {html}");

        let html = markdown_to_lexical_html("######");
        assert!(!html.contains("<h6>"), "Bare ###### should NOT be heading. HTML: {html}");
        assert!(html.contains("<p>"), "HTML: {html}");

        // But "# " with space IS a valid heading (used by the heading export)
        let html = markdown_to_lexical_html("# ");
        assert!(html.contains("<h1>"), "# with space should remain heading. HTML: {html}");

        // And "# text" is obviously a heading
        let html = markdown_to_lexical_html("# Hello");
        assert!(html.contains("<h1>"), "# Hello should be heading. HTML: {html}");
    }

    #[test]
    fn test_basic_markdown() {
        let html = markdown_to_lexical_html("# Hello\n\nWorld");
        assert!(html.contains("<h1>"), "HTML: {html}");
        assert!(html.contains("Hello"), "HTML: {html}");
        assert!(html.contains("World"), "HTML: {html}");
    }

    #[test]
    fn test_code_block_language() {
        let html = markdown_to_lexical_html("```rust\nfn main() {}\n```");
        assert!(html.contains("data-language=\"rust\""), "HTML: {html}");
        assert!(html.contains("fn main()"), "HTML: {html}");
        assert!(!html.contains("<code>"), "HTML: {html}");
    }

    #[test]
    fn test_strikethrough() {
        let html = markdown_to_lexical_html("~~deleted~~");
        assert!(html.contains("<s>"), "HTML: {html}");
        assert!(html.contains("</s>"), "HTML: {html}");
        assert!(!html.contains("<del>"), "HTML: {html}");
    }

    #[test]
    fn test_highlight() {
        let html = markdown_to_lexical_html("==highlighted==");
        assert!(html.contains("<mark>"), "HTML: {html}");
        assert!(html.contains("</mark>"), "HTML: {html}");
    }

    #[test]
    fn test_empty_paragraphs() {
        let html = markdown_to_lexical_html("hello\n\n\n\nworld");
        let count = html.matches("<p><br></p>").count();
        assert_eq!(
            count, 2,
            "Expected 2 empty paragraphs, got {count}. HTML: {html}"
        );
    }

    #[test]
    fn test_soft_breaks_become_hard() {
        let html = markdown_to_lexical_html("line1\nline2");
        assert!(
            html.contains("<br"),
            "Soft break should become <br>. HTML: {html}"
        );
    }

    #[test]
    fn test_checklist_classes() {
        let html = markdown_to_lexical_html("- [x] done\n- [ ] todo");
        assert!(
            html.contains("contains-task-list"),
            "UL should have contains-task-list. HTML: {html}"
        );
        assert!(
            html.contains("task-list-item"),
            "LI should have task-list-item. HTML: {html}"
        );
    }

    #[test]
    fn test_checklist_no_phantom_item() {
        let md = "## Action Items\n\n- [x] First\n- [ ] Second\n- [ ] Third";
        let html = markdown_to_lexical_html(md);
        assert!(
            !html.contains("<li>\n</li>"),
            "Unexpected empty list item. HTML: {html}"
        );
        assert!(
            !html.contains("<li></li>"),
            "Unexpected empty list item. HTML: {html}"
        );
    }

    #[test]
    fn test_checklist_with_extra_blank_line() {
        let md = "## Action Items\n\n\n- [x] Sarah to create Jira epics\n- [x] Marcus to schedule design review\n- [ ] David to benchmark latency";
        let html = markdown_to_lexical_html(md);
        // Should have exactly 3 list items and no empty ones
        assert_eq!(
            html.matches("<li").count(),
            3,
            "Expected 3 <li> tags. HTML: {html}"
        );
        assert!(
            !html.contains("<li>\n</li>"),
            "Unexpected empty list item. HTML: {html}"
        );
        assert!(
            !html.contains("<li></li>"),
            "Unexpected empty list item. HTML: {html}"
        );
    }

    #[test]
    fn test_nested_bullet_list_under_checklist_item_stays_plain_ul() {
        let md = "- [ ] Parent\n  - Child";
        let html = markdown_to_lexical_html(md);

        assert_eq!(
            html.matches("contains-task-list").count(),
            1,
            "Expected only the checklist UL to have contains-task-list. HTML: {html}"
        );
        assert!(
            html.contains("<ul><li>Child</li></ul>"),
            "Expected nested bullet list to stay a plain UL. HTML: {html}"
        );
    }

    #[test]
    fn test_separate_bullet_list_after_checklist_stays_separate() {
        let md = "- [ ] Task\n\n* Bullet";
        let html = markdown_to_lexical_html(md);

        assert_eq!(
            html.matches("<ul").count(),
            2,
            "Expected two separate ULs. HTML: {html}"
        );
        assert_eq!(
            html.matches("contains-task-list").count(),
            1,
            "Expected only the checklist UL to have checklist classes. HTML: {html}"
        );
    }

    #[test]
    fn test_youtube_url_becomes_iframe() {
        let html = markdown_to_lexical_html("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
        assert!(
            html.contains(r#"data-lexical-youtube="dQw4w9WgXcQ""#),
            "YouTube URL should become iframe with data-lexical-youtube. HTML: {html}"
        );
        assert!(
            !html.contains("<a href="),
            "YouTube URL should not remain as a link. HTML: {html}"
        );
    }

    #[test]
    fn test_youtube_short_url_becomes_iframe() {
        let html = markdown_to_lexical_html("https://youtu.be/dQw4w9WgXcQ");
        assert!(
            html.contains(r#"data-lexical-youtube="dQw4w9WgXcQ""#),
            "Short YouTube URL should become iframe. HTML: {html}"
        );
    }

    #[test]
    fn test_youtube_named_link_stays_link() {
        let html = markdown_to_lexical_html("[My Video](https://www.youtube.com/watch?v=dQw4w9WgXcQ)");
        assert!(
            html.contains("<a href="),
            "Named YouTube link should stay as link. HTML: {html}"
        );
        assert!(
            !html.contains("data-lexical-youtube"),
            "Named YouTube link should not become iframe. HTML: {html}"
        );
    }

    #[test]
    fn test_image() {
        let html = markdown_to_lexical_html("![alt](attachment://hash.png)");
        assert!(html.contains("<img"), "HTML: {html}");
        assert!(html.contains("attachment://hash.png"), "HTML: {html}");
    }

    #[test]
    fn test_mixed_markdown_code_block_is_not_nested() {
        let markdown = "Here are some useful commands when debugging error handling:\n\n```bash\n# Run with backtrace enabled\nRUST_BACKTRACE=1 cargo run\n\n# Run tests with output\ncargo test -- --nocapture\n```\n\n## Next";
        let html = markdown_to_lexical_html(markdown);

        assert_eq!(
            html.matches("<pre data-language=\"bash\">").count(),
            1,
            "HTML: {html}"
        );
        assert!(html.contains("RUST_BACKTRACE=1 cargo run"), "HTML: {html}");
        assert!(!html.contains("<pre><code"), "HTML: {html}");
        assert!(!html.contains("</code></pre>"), "HTML: {html}");
    }
}

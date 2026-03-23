use std::collections::BTreeSet;

/// Extract the title from the first H1 heading in markdown.
pub fn title_from_markdown(markdown: &str) -> String {
    markdown
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .find_map(|line| {
            let rest = line.strip_prefix("# ")?;
            let cleaned = rest.trim();
            (!cleaned.is_empty()).then(|| cleaned.to_string())
        })
        .unwrap_or_default()
}

/// Generate a plain-text preview from markdown, skipping the title, images,
/// rules, and code blocks.
pub fn preview_from_markdown(markdown: &str) -> String {
    let mut skipped_title = false;
    let mut in_code_block = false;
    let mut preview = String::with_capacity(160);
    for line in markdown.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("```") {
            in_code_block = !in_code_block;
            continue;
        }
        if in_code_block || trimmed.is_empty() {
            continue;
        }
        // Skip first H1 (already shown as card title)
        if !skipped_title && trimmed.starts_with("# ") {
            skipped_title = true;
            continue;
        }
        // Skip images and horizontal rules
        if trimmed.starts_with("![") || trimmed.starts_with("---") || trimmed.starts_with("***") {
            continue;
        }
        let cleaned = strip_markdown_syntax(trimmed);
        if cleaned.is_empty() {
            continue;
        }
        if !preview.is_empty() {
            preview.push(' ');
        }
        preview.push_str(&cleaned);
        if preview.len() >= 140 {
            break;
        }
    }
    preview.truncate(preview.chars().take(140).map(char::len_utf8).sum());
    preview
}

/// Strip common markdown inline and block syntax for plain-text preview.
pub fn strip_markdown_syntax(line: &str) -> String {
    let mut s = line.to_string();

    // Strip heading markers
    if s.starts_with('#') {
        s = s.trim_start_matches('#').trim().to_string();
    }
    // Strip blockquote markers
    while s.starts_with("> ") || s.starts_with('>') {
        s = s
            .strip_prefix("> ")
            .or_else(|| s.strip_prefix('>'))
            .unwrap_or(&s)
            .to_string();
    }
    // Strip list markers: "- ", "* ", "+ ", "1. ", "2) " etc.
    if let Some(rest) = s
        .strip_prefix("- ")
        .or_else(|| s.strip_prefix("* "))
        .or_else(|| s.strip_prefix("+ "))
    {
        s = rest.to_string();
    } else if s.len() > 2 {
        let bytes = s.as_bytes();
        if bytes[0].is_ascii_digit() && (bytes[1] == b'.' || bytes[1] == b')') {
            s = s[2..].trim_start().to_string();
        } else if bytes.len() > 3
            && bytes[0].is_ascii_digit()
            && bytes[1].is_ascii_digit()
            && (bytes[2] == b'.' || bytes[2] == b')')
        {
            s = s[3..].trim_start().to_string();
        }
    }
    // Strip checkbox markers (with or without trailing space/content)
    s = s
        .strip_prefix("[ ] ")
        .or_else(|| s.strip_prefix("[x] "))
        .or_else(|| s.strip_prefix("[ ]"))
        .or_else(|| s.strip_prefix("[x]"))
        .unwrap_or(&s)
        .trim()
        .to_string();
    // Strip inline markdown: bold, italic, strikethrough, inline code
    s = s.replace("***", "").replace("**", "").replace("~~", "");
    // Strip inline code backticks
    s = s.replace('`', "");
    // Strip markdown links [text](url) → text
    while let Some(start) = s.find('[') {
        if let Some(mid) = s[start..].find("](") {
            if let Some(end) = s[start + mid..].find(')') {
                let text = &s[start + 1..start + mid].to_string();
                s = format!("{}{}{}", &s[..start], text, &s[start + mid + end + 1..]);
                continue;
            }
        }
        break;
    }
    // Strip standalone emphasis markers (* or _) but keep the content
    s = s
        .replace(" *", " ")
        .replace("* ", " ")
        .replace(" _", " ")
        .replace("_ ", " ");
    if s.starts_with('*') || s.starts_with('_') {
        s = s[1..].to_string();
    }
    if s.ends_with('*') || s.ends_with('_') {
        s = s[..s.len() - 1].to_string();
    }

    s
}

/// Extract hashtags from markdown, ignoring code blocks, inline code, and link
/// destinations. Returns a sorted, deduplicated, lowercased list.
pub fn extract_tags(markdown: &str) -> Vec<String> {
    let bytes = markdown.as_bytes();
    let mut tags = BTreeSet::new();
    let mut index = 0;
    let mut fence_char: u8 = 0;
    let mut fence_len: usize = 0;

    while index < bytes.len() {
        let at_line_start = index == 0 || bytes[index - 1] == b'\n';

        // Check for fenced code block delimiter (``` or ~~~, 3+ chars) at start of line
        if at_line_start
            && index + 2 < bytes.len()
            && (bytes[index] == b'`' || bytes[index] == b'~')
        {
            let ch = bytes[index];
            let mut run = 0;
            while index + run < bytes.len() && bytes[index + run] == ch {
                run += 1;
            }
            if run >= 3 {
                if fence_len == 0 {
                    fence_char = ch;
                    fence_len = run;
                } else if ch == fence_char && run >= fence_len {
                    fence_char = 0;
                    fence_len = 0;
                }
                index += run;
                while index < bytes.len() && bytes[index] != b'\n' {
                    index += 1;
                }
                continue;
            }
        }

        // Skip everything inside fenced code blocks
        if fence_len > 0 {
            index += 1;
            continue;
        }

        // Skip inline code spans (handles multi-backtick delimiters like `` `code` ``)
        if bytes[index] == b'`' {
            let mut tick_count = 0;
            while index + tick_count < bytes.len() && bytes[index + tick_count] == b'`' {
                tick_count += 1;
            }
            index += tick_count;
            loop {
                if index >= bytes.len() {
                    break;
                }
                if bytes[index] == b'`' {
                    let mut close_count = 0;
                    while index + close_count < bytes.len() && bytes[index + close_count] == b'`' {
                        close_count += 1;
                    }
                    index += close_count;
                    if close_count == tick_count {
                        break;
                    }
                } else {
                    index += 1;
                }
            }
            continue;
        }

        // Skip markdown link/image destinations: ](destination)
        if bytes[index] == b']' && index + 1 < bytes.len() && bytes[index + 1] == b'(' {
            index += 2;
            let mut depth = 1usize;

            while index < bytes.len() && depth > 0 {
                match bytes[index] {
                    b'\\' => {
                        index += 1;
                        if index < bytes.len() {
                            index += 1;
                        }
                    }
                    b'(' => {
                        depth += 1;
                        index += 1;
                    }
                    b')' => {
                        depth -= 1;
                        index += 1;
                    }
                    _ => {
                        index += 1;
                    }
                }
            }
            continue;
        }

        if bytes[index] != b'#' {
            index += 1;
            continue;
        }

        if index > 0 && is_tag_char(bytes[index - 1]) {
            index += 1;
            continue;
        }

        let tag_start = index + 1;
        if tag_start >= bytes.len() || !is_tag_char(bytes[tag_start]) {
            index += 1;
            continue;
        }

        let mut tag_end = tag_start;
        while tag_end < bytes.len() && is_tag_char(bytes[tag_end]) {
            tag_end += 1;
        }

        // Skip tags that are purely numeric (e.g. #2, #123)
        if bytes[tag_start..tag_end]
            .iter()
            .any(u8::is_ascii_alphabetic)
        {
            let mut tag = String::from_utf8_lossy(&bytes[tag_start..tag_end]).into_owned();
            tag.make_ascii_lowercase();
            tags.insert(tag);
        }
        index = tag_end;
    }

    tags.into_iter().collect()
}

fn is_tag_char(byte: u8) -> bool {
    byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-'
}

/// Strip the leading H1 title line from markdown, returning the body.
pub fn strip_title_line(markdown: &str) -> String {
    if let Some(rest) = markdown.strip_prefix("# ") {
        // Skip the first line (the H1 title)
        match rest.find('\n') {
            Some(pos) => rest[pos..].trim_start_matches('\n').to_string(),
            None => String::new(), // entire content was just the title
        }
    } else {
        markdown.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strip_title_line_removes_h1_and_keeps_body() {
        assert_eq!(strip_title_line("# Title\n\nBody"), "Body");
    }

    #[test]
    fn strip_title_line_handles_title_only_notes() {
        assert_eq!(strip_title_line("# Title"), "");
    }

    #[test]
    fn strip_title_line_leaves_non_h1_markdown_unchanged() {
        let markdown = "## Section\nBody";
        assert_eq!(strip_title_line(markdown), markdown);
    }

    #[test]
    fn title_from_markdown_uses_first_non_empty_h1() {
        let markdown = "\n\n# Trail Note\n\n## Section\nBody";
        assert_eq!(title_from_markdown(markdown), "Trail Note");
    }

    #[test]
    fn preview_from_markdown_skips_title_images_rules_and_code() {
        let markdown = [
            "# Trail Note",
            "",
            "![diagram](attachment://hash.png)",
            "---",
            "```rust",
            "let hidden = true;",
            "```",
            "",
            "> Quoted context",
            "- [x] Done item",
            "Regular [link](https://example.com) text",
        ]
        .join("\n");

        assert_eq!(
            preview_from_markdown(&markdown),
            "Quoted context Done item Regular link text"
        );
    }

    #[test]
    fn strip_markdown_syntax_removes_common_markdown_markup() {
        let line = "> - [x] **Task** [label](https://example.com) `code`";
        assert_eq!(strip_markdown_syntax(line), "Task label code");
    }

    #[test]
    fn extract_tags_ignores_code_and_dedupes_sorted() {
        let markdown = [
            "#Tag #tag-two #123 #Tag",
            "",
            "Inline `#ignored` and ``#also_ignored``",
            "",
            "```rust",
            "#not-a-tag",
            "```",
            "",
            "~~~bash",
            "#still-not-a-tag",
            "~~~",
            "",
            "#real_tag",
        ]
        .join("\n");

        assert_eq!(
            extract_tags(&markdown),
            vec![
                "real_tag".to_string(),
                "tag".to_string(),
                "tag-two".to_string(),
            ]
        );
    }

    #[test]
    fn extract_tags_ignores_markdown_link_destinations() {
        let markdown = [
            "- [ ] context: An anchor link to [the table section](#tables).",
            "",
            "Visible tag in prose: #trail",
            "",
            "[#visible-link-text](https://example.com/path#fragment)",
        ]
        .join("\n");

        assert_eq!(
            extract_tags(&markdown),
            vec!["trail".to_string(), "visible-link-text".to_string(),]
        );
    }
}

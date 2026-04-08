use std::collections::{BTreeSet, HashMap, HashSet};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TagOccurrence {
    pub start: usize,
    pub end: usize,
    pub canonical_path: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WikiLinkOccurrence {
    pub start: usize,
    pub end: usize,
    pub title: String,
    pub normalized_title: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WikiLinkTitleRewrite {
    pub location: usize,
    pub current_title: String,
    pub new_title: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RewrittenWikiLinkTitle {
    pub old_location: usize,
    pub new_location: usize,
    pub new_title: String,
}

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
    // Strip wikilinks [[title]] → title, then markdown links [text](url) → text
    while let Some(start) = s.find('[') {
        if s[start..].starts_with("[[") {
            if let Some(close) = s[start + 2..].find("]]") {
                let title = s[start + 2..start + 2 + close].trim().to_string();
                s = format!("{}{}{}", &s[..start], title, &s[start + 2 + close + 2..]);
                continue;
            }
        }
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

pub fn normalize_wikilink_title(raw: &str) -> Option<String> {
    let normalized = raw.split_whitespace().collect::<Vec<_>>().join(" ");
    if normalized.is_empty() {
        return None;
    }

    Some(normalized.to_lowercase())
}

/// Canonicalize a tag path without surrounding `#` delimiters.
///
/// Returns `None` when the input violates the phase-1 tag contract.
pub fn canonicalize_tag_path(raw: &str) -> Option<String> {
    let trimmed = strip_trailing_tag_separators(raw);
    if trimmed.is_empty() {
        return None;
    }

    let mut canonical_segments = Vec::new();

    for segment in trimmed.split('/') {
        let trimmed = segment.trim();

        if trimmed.is_empty() {
            return None;
        }

        let mut characters = trimmed.chars();
        let first = characters.next()?;
        if first.is_numeric() || !(first.is_alphanumeric() || matches!(first, '_' | '-')) {
            return None;
        }

        for character in characters {
            if !(character.is_alphanumeric() || matches!(character, '_' | '-')) {
                return None;
            }
        }

        canonical_segments.push(trimmed.to_lowercase());
    }

    if canonical_segments.is_empty() {
        return None;
    }

    Some(canonical_segments.join("/"))
}

fn strip_trailing_tag_separators(raw: &str) -> &str {
    let mut trimmed = raw.trim();

    while let Some(next) = trimmed.strip_suffix('/') {
        trimmed = next.trim_end();
    }

    trimmed
}

/// Render a canonical tag path back into authored markdown syntax.
pub fn render_tag_token(path: &str) -> Option<String> {
    let canonical = canonicalize_tag_path(path)?;
    Some(format!("#{canonical}"))
}

pub fn ancestor_tag_paths(path: &str) -> Vec<String> {
    let canonical = match canonicalize_tag_path(path) {
        Some(value) => value,
        None => return Vec::new(),
    };

    let segments = canonical.split('/').collect::<Vec<_>>();
    if segments.len() <= 1 {
        return Vec::new();
    }

    let mut ancestors = Vec::with_capacity(segments.len() - 1);
    for depth in 1..segments.len() {
        ancestors.push(segments[..depth].join("/"));
    }
    ancestors
}

/// Extract hashtags from markdown, ignoring code blocks, inline code, and link
/// destinations. Returns a sorted, deduplicated list of canonical direct tags.
pub fn extract_tags(markdown: &str) -> Vec<String> {
    let mut tags = BTreeSet::new();
    for occurrence in extract_tag_occurrences(markdown) {
        tags.insert(occurrence.canonical_path);
    }
    tags.into_iter().collect()
}

pub fn extract_tag_occurrences(markdown: &str) -> Vec<TagOccurrence> {
    let bytes = markdown.as_bytes();
    let mut occurrences = Vec::new();
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

        if is_hash_escaped(bytes, index) || !has_valid_tag_boundary(markdown, index) {
            index += 1;
            continue;
        }

        if let Some(occurrence) = parse_simple_tag(markdown, index) {
            index = occurrence.end;
            occurrences.push(occurrence);
            continue;
        }

        index += 1;
    }

    occurrences
}

pub fn extract_wikilink_occurrences(markdown: &str) -> Vec<WikiLinkOccurrence> {
    let bytes = markdown.as_bytes();
    let mut occurrences = Vec::new();
    let mut index = 0;
    let mut fence_char: u8 = 0;
    let mut fence_len: usize = 0;

    while index < bytes.len() {
        let at_line_start = index == 0 || bytes[index - 1] == b'\n';

        if let Some(fence_index) = fence_marker_index_at_line_start(bytes, index, at_line_start) {
            let ch = bytes[fence_index];
            let mut run = 0;
            while fence_index + run < bytes.len() && bytes[fence_index + run] == ch {
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
                index = fence_index + run;
                while index < bytes.len() && bytes[index] != b'\n' {
                    index += 1;
                }
                continue;
            }
        }

        if fence_len > 0 {
            index += 1;
            continue;
        }

        if bytes[index] == b'`' {
            let mut tick_count = 0;
            while index + tick_count < bytes.len() && bytes[index + tick_count] == b'`' {
                tick_count += 1;
            }
            let scan_start = index + tick_count;
            let mut scan = scan_start;
            let mut matched = false;
            loop {
                if scan >= bytes.len() {
                    break;
                }
                if bytes[scan] == b'`' {
                    let mut close_count = 0;
                    while scan + close_count < bytes.len() && bytes[scan + close_count] == b'`' {
                        close_count += 1;
                    }
                    scan += close_count;
                    if close_count == tick_count {
                        matched = true;
                        break;
                    }
                } else {
                    scan += 1;
                }
            }
            // If closed, skip past the inline code span. If unclosed, skip
            // only the opening backticks so subsequent wikilinks are found.
            index = if matched { scan } else { scan_start };
            continue;
        }

        if !is_wikilink_open(bytes, index) {
            index += 1;
            continue;
        }

        if let Some(occurrence) = parse_wikilink(markdown, index) {
            index = occurrence.end;
            occurrences.push(occurrence);
            continue;
        }

        index += 1;
    }

    occurrences
}

fn fence_marker_index_at_line_start(
    bytes: &[u8],
    index: usize,
    at_line_start: bool,
) -> Option<usize> {
    if !at_line_start {
        return None;
    }

    let mut fence_index = index;
    let mut spaces = 0;
    while fence_index < bytes.len() && bytes[fence_index] == b' ' && spaces < 3 {
        fence_index += 1;
        spaces += 1;
    }

    if fence_index + 2 < bytes.len() && (bytes[fence_index] == b'`' || bytes[fence_index] == b'~') {
        Some(fence_index)
    } else {
        None
    }
}

fn is_hash_escaped(bytes: &[u8], index: usize) -> bool {
    let mut slash_count = 0;
    let mut current = index;

    while current > 0 && bytes[current - 1] == b'\\' {
        slash_count += 1;
        current -= 1;
    }

    slash_count % 2 == 1
}

fn is_wikilink_open(bytes: &[u8], index: usize) -> bool {
    index + 1 < bytes.len()
        && bytes[index] == b'['
        && bytes[index + 1] == b'['
        && !is_square_bracket_escaped(bytes, index)
}

fn is_square_bracket_escaped(bytes: &[u8], index: usize) -> bool {
    let mut slash_count = 0;
    let mut current = index;

    while current > 0 && bytes[current - 1] == b'\\' {
        slash_count += 1;
        current -= 1;
    }

    slash_count % 2 == 1
}

fn parse_wikilink(markdown: &str, start_index: usize) -> Option<WikiLinkOccurrence> {
    let mut close_index = None;
    let bytes = markdown.as_bytes();
    let mut index = start_index + 2;

    while index + 1 < bytes.len() {
        if bytes[index] == b'\n' || bytes[index] == b'\r' {
            return None;
        }

        if bytes[index] == b']' && bytes[index + 1] == b']' {
            close_index = Some(index);
            break;
        }

        index += 1;
    }

    let close_index = close_index?;
    let raw_title = markdown[start_index + 2..close_index].trim();
    if raw_title.is_empty() || raw_title.contains('[') || raw_title.contains(']') {
        return None;
    }

    let normalized_title = normalize_wikilink_title(raw_title)?;

    Some(WikiLinkOccurrence {
        start: start_index,
        end: close_index + 2,
        title: raw_title.to_string(),
        normalized_title,
    })
}

fn has_valid_tag_boundary(markdown: &str, hash_index: usize) -> bool {
    let Some(previous) = markdown[..hash_index].chars().next_back() else {
        return true;
    };

    !(is_boundary_disallowed_tag_char(previous) || matches!(previous, '/' | ':' | '.'))
}

fn is_boundary_disallowed_tag_char(character: char) -> bool {
    character.is_alphanumeric() || matches!(character, '_' | '-')
}

fn is_simple_tag_body_char(character: char) -> bool {
    character.is_alphanumeric() || matches!(character, '_' | '-' | '/')
}

fn parse_simple_tag(markdown: &str, start_index: usize) -> Option<TagOccurrence> {
    let rest = &markdown[start_index + 1..];
    let mut consumed_end = None;

    for (offset, character) in rest.char_indices() {
        if is_simple_tag_body_char(character) {
            consumed_end = Some(offset + character.len_utf8());
            continue;
        }
        break;
    }

    let consumed_end = consumed_end?;
    let end_index = start_index + 1 + consumed_end;
    let candidate = &markdown[start_index + 1..end_index];
    let canonical = canonicalize_tag_path(candidate)?;

    if !candidate.trim_end().ends_with('/') && has_invalid_simple_trailing_text(markdown, end_index)
    {
        return None;
    }

    Some(TagOccurrence {
        start: start_index,
        end: end_index,
        canonical_path: canonical,
    })
}

fn has_invalid_simple_trailing_text(markdown: &str, end_index: usize) -> bool {
    let mut characters = markdown[end_index..].chars();
    let Some(next) = characters.next() else {
        return false;
    };

    if !next.is_whitespace() {
        return false;
    }

    if matches!(next, '\n' | '\r') {
        return false;
    }

    for character in characters {
        if matches!(character, '\n' | '\r') {
            return false;
        }

        if character.is_whitespace() {
            continue;
        }

        return character != '#'
            && (character.is_alphanumeric() || matches!(character, '_' | '-' | '/'));
    }

    false
}

pub fn rewrite_tag_path_in_markdown(
    markdown: &str,
    from_path: &str,
    to_path: Option<&str>,
) -> Option<String> {
    let from_canonical = canonicalize_tag_path(from_path)?;
    let to_canonical = match to_path {
        Some(path) => Some(canonicalize_tag_path(path)?),
        None => None,
    };

    let occurrences = extract_tag_occurrences(markdown);
    if occurrences.is_empty() {
        return Some(markdown.to_string());
    }

    let mut existing_non_source = HashSet::new();
    for occurrence in &occurrences {
        if !tag_path_matches_subtree(&occurrence.canonical_path, &from_canonical) {
            existing_non_source.insert(occurrence.canonical_path.clone());
        }
    }

    let mut output = String::with_capacity(markdown.len());
    let mut cursor = 0;
    let mut emitted_destinations = existing_non_source;

    for occurrence in occurrences {
        output.push_str(&markdown[cursor..occurrence.start]);

        if tag_path_matches_subtree(&occurrence.canonical_path, &from_canonical) {
            if let Some(destination) = &to_canonical {
                let suffix = &occurrence.canonical_path[from_canonical.len()..];
                let rewritten_path = format!("{destination}{suffix}");
                if emitted_destinations.insert(rewritten_path.clone()) {
                    if let Some(rendered) = render_tag_token(&rewritten_path) {
                        output.push_str(&rendered);
                    }
                }
            }
        } else {
            output.push_str(&markdown[occurrence.start..occurrence.end]);
        }

        cursor = occurrence.end;
    }

    output.push_str(&markdown[cursor..]);
    Some(output)
}

pub fn rewrite_wikilink_titles_with_locations(
    markdown: &str,
    rewrites: &[WikiLinkTitleRewrite],
) -> (String, Vec<RewrittenWikiLinkTitle>) {
    if rewrites.is_empty() {
        return (markdown.to_string(), Vec::new());
    }

    let rewrites_by_location = rewrites
        .iter()
        .map(|rewrite| (rewrite.location, rewrite))
        .collect::<HashMap<_, _>>();
    let occurrences = extract_wikilink_occurrences(markdown);
    if occurrences.is_empty() {
        return (markdown.to_string(), Vec::new());
    }

    let mut output = String::with_capacity(markdown.len());
    let mut cursor = 0;
    let mut applied_rewrites = Vec::new();

    for occurrence in occurrences {
        output.push_str(&markdown[cursor..occurrence.start]);

        if let Some(rewrite) = rewrites_by_location.get(&occurrence.start) {
            if occurrence.title == rewrite.current_title {
                let new_location = output.len();
                output.push_str("[[");
                output.push_str(&rewrite.new_title);
                output.push_str("]]");
                applied_rewrites.push(RewrittenWikiLinkTitle {
                    old_location: occurrence.start,
                    new_location,
                    new_title: rewrite.new_title.clone(),
                });
            } else {
                output.push_str(&markdown[occurrence.start..occurrence.end]);
            }
        } else {
            output.push_str(&markdown[occurrence.start..occurrence.end]);
        }

        cursor = occurrence.end;
    }

    output.push_str(&markdown[cursor..]);
    (output, applied_rewrites)
}

fn tag_path_matches_subtree(path: &str, root: &str) -> bool {
    path == root
        || path
            .strip_prefix(root)
            .is_some_and(|suffix| suffix.starts_with('/'))
}

pub fn strip_tags_from_markdown(markdown: &str) -> String {
    let occurrences = extract_tag_occurrences(markdown);
    if occurrences.is_empty() {
        return markdown.to_string();
    }

    let mut output = String::with_capacity(markdown.len());
    let mut cursor = 0;

    for occurrence in occurrences {
        output.push_str(&markdown[cursor..occurrence.start]);
        cursor = occurrence.end;
    }

    output.push_str(&markdown[cursor..]);
    output
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
    use serde::Deserialize;

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct TagFixtureCorpus {
        path_cases: Vec<TagPathCase>,
        entity_cases: Vec<TagEntityCase>,
    }

    #[derive(Deserialize)]
    struct TagPathCase {
        raw: String,
        canonical: Option<String>,
        rendered: Option<String>,
    }

    #[derive(Deserialize)]
    struct TagEntityCase {
        text: String,
        #[serde(rename = "match")]
        entity_match: Option<TagEntityFixture>,
    }

    #[derive(Deserialize)]
    struct TagEntityFixture {
        start: usize,
        end: usize,
        canonical: String,
    }

    fn shared_tag_fixtures() -> TagFixtureCorpus {
        serde_json::from_str(include_str!("../../../../src/shared/lib/tag-fixtures.json")).unwrap()
    }

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

    #[test]
    fn extract_tags_ignores_tags_inside_inline_code() {
        let markdown = "Use `#config` for settings and (#real).";
        assert_eq!(extract_tags(markdown), vec!["real".to_string()]);
    }

    #[test]
    fn preview_from_markdown_truncates_long_content() {
        let long_line = "a".repeat(200);
        let markdown = format!("# Title\n\n{long_line}");
        let preview = preview_from_markdown(&markdown);
        assert_eq!(preview.len(), 140);
    }

    #[test]
    fn strip_markdown_syntax_handles_nested_formatting() {
        assert_eq!(strip_markdown_syntax("**_bold italic_**"), "bold italic");
    }

    #[test]
    fn strip_markdown_syntax_strips_wikilink_brackets() {
        assert_eq!(
            strip_markdown_syntax("See [[Project Alpha]] for details"),
            "See Project Alpha for details"
        );
        assert_eq!(strip_markdown_syntax("[[A]] and [[B]]"), "A and B");
    }

    #[test]
    fn preview_from_markdown_strips_wikilinks() {
        let markdown = "# Title\n\nCheck [[Meeting Notes]] for context";
        assert_eq!(
            preview_from_markdown(markdown),
            "Check Meeting Notes for context"
        );
    }

    #[test]
    fn normalize_wikilink_title_trims_collapses_and_lowercases() {
        assert_eq!(
            normalize_wikilink_title("  Project   Alpha  "),
            Some("project alpha".to_string())
        );
        assert_eq!(normalize_wikilink_title("   "), None);
    }

    #[test]
    fn title_from_markdown_no_h1_returns_empty() {
        assert_eq!(title_from_markdown("## Not H1\nSome body text"), "");
    }

    #[test]
    fn title_from_markdown_empty_h1_returns_empty() {
        assert_eq!(title_from_markdown("# \n\nBody"), "");
    }

    #[test]
    fn canonicalize_tag_path_normalizes_segments() {
        assert_eq!(
            canonicalize_tag_path("Work/Project-Alpha "),
            Some("work/project-alpha".to_string())
        );
        assert_eq!(canonicalize_tag_path("work/"), Some("work".to_string()));
        assert_eq!(
            canonicalize_tag_path("work/project/"),
            Some("work/project".to_string())
        );
    }

    #[test]
    fn canonicalize_tag_path_rejects_empty_or_numeric_leading_segments() {
        assert_eq!(canonicalize_tag_path("work//project"), None);
        assert_eq!(canonicalize_tag_path("123"), None);
        assert_eq!(canonicalize_tag_path("2026roadmap"), None);
        assert_eq!(canonicalize_tag_path("journal/2026"), None);
        assert_eq!(canonicalize_tag_path("journal/2026roadmap"), None);
    }

    #[test]
    fn render_tag_token_renders_simple_paths() {
        assert_eq!(render_tag_token("roadmap"), Some("#roadmap".to_string()));
        assert_eq!(
            render_tag_token("work/project-alpha"),
            Some("#work/project-alpha".to_string())
        );
    }

    #[test]
    fn shared_fixture_corpus_stays_in_sync_with_rust_parser() {
        let fixtures = shared_tag_fixtures();

        for test_case in fixtures.path_cases {
            assert_eq!(canonicalize_tag_path(&test_case.raw), test_case.canonical);
            assert_eq!(render_tag_token(&test_case.raw), test_case.rendered);
        }

        for test_case in fixtures.entity_cases {
            let occurrences = extract_tag_occurrences(&test_case.text);

            if let Some(expected) = test_case.entity_match {
                assert_eq!(
                    occurrences,
                    vec![TagOccurrence {
                        start: expected.start,
                        end: expected.end,
                        canonical_path: expected.canonical,
                    }]
                );
            } else {
                assert!(occurrences.is_empty());
            }
        }
    }

    #[test]
    fn ancestor_tag_paths_returns_all_ancestors() {
        assert_eq!(
            ancestor_tag_paths("work/project/mobile"),
            vec!["work".to_string(), "work/project".to_string()]
        );
        assert!(ancestor_tag_paths("work").is_empty());
    }

    #[test]
    fn extract_tags_supports_simple_and_nested_tags() {
        let markdown = [
            "#RoadMap",
            "#work/project",
            "#work/",
            "#project-alpha",
            "#work/project-alpha",
            "#roadmap",
            "#work/project",
        ]
        .join("\n");

        assert_eq!(
            extract_tags(&markdown),
            vec![
                "project-alpha".to_string(),
                "roadmap".to_string(),
                "work".to_string(),
                "work/project".to_string(),
                "work/project-alpha".to_string(),
            ]
        );
    }

    #[test]
    fn extract_tags_rejects_invalid_and_ambiguous_forms() {
        let markdown = [
            "#123",
            "#2026roadmap",
            "#project alpha",
            "#work//project",
            "#!/bin/bash",
            "\\#not-a-tag",
            "https://example.com/#frag",
        ]
        .join("\n");

        assert_eq!(extract_tags(&markdown), Vec::<String>::new());
    }

    #[test]
    fn extract_tags_keeps_multiple_tags_on_same_line() {
        let markdown = "#roadmap #work/project";
        assert_eq!(
            extract_tags(markdown),
            vec!["roadmap".to_string(), "work/project".to_string()]
        );
    }

    #[test]
    fn extract_tags_rejects_wrapped_nested_segments_with_spacing() {
        let markdown = "#work/ project alpha #";
        assert_eq!(extract_tags(markdown), vec!["work".to_string()]);
    }

    #[test]
    fn extract_tags_keeps_simple_tag_before_horizontal_rule() {
        let markdown = ["# h1 Heading 8-)", "#archi", "---"].join("\n");
        assert_eq!(extract_tags(&markdown), vec!["archi".to_string()]);
    }

    #[test]
    fn extract_tags_keeps_simple_tag_before_plain_text_on_next_line() {
        let markdown = ["#archi", "next line"].join("\n");
        assert_eq!(extract_tags(&markdown), vec!["archi".to_string()]);
    }

    #[test]
    fn extract_tags_lowercases_unicode() {
        let markdown = "#Café";
        assert_eq!(extract_tags(markdown), vec!["café".to_string()]);
    }

    #[test]
    fn extract_tag_occurrences_tracks_spans_and_paths() {
        let markdown = "hello #roadmap, and #project-alpha";
        assert_eq!(
            extract_tag_occurrences(markdown),
            vec![
                TagOccurrence {
                    start: 6,
                    end: 14,
                    canonical_path: "roadmap".to_string(),
                },
                TagOccurrence {
                    start: 20,
                    end: 34,
                    canonical_path: "project-alpha".to_string(),
                },
            ]
        );
    }

    #[test]
    fn extract_wikilinks_tracks_occurrences_and_titles() {
        let markdown = "hello [[Roadmap Q2]] and [[Project Alpha]]";
        assert_eq!(
            extract_wikilink_occurrences(markdown),
            vec![
                WikiLinkOccurrence {
                    start: 6,
                    end: 20,
                    title: "Roadmap Q2".to_string(),
                    normalized_title: "roadmap q2".to_string(),
                },
                WikiLinkOccurrence {
                    start: 25,
                    end: 42,
                    title: "Project Alpha".to_string(),
                    normalized_title: "project alpha".to_string(),
                },
            ]
        );
    }

    #[test]
    fn extract_wikilinks_ignores_code_contexts() {
        let markdown = [
            "Use `[[not this]]` inline.",
            "",
            "```md",
            "[[also not this]]",
            "```",
            "",
            "[[real link]]",
        ]
        .join("\n");

        assert_eq!(
            extract_wikilink_occurrences(&markdown),
            vec![WikiLinkOccurrence {
                start: 57,
                end: 70,
                title: "real link".to_string(),
                normalized_title: "real link".to_string(),
            }]
        );
    }

    #[test]
    fn extract_wikilinks_ignores_indented_fenced_code_blocks() {
        let markdown = [
            "   ```md",
            "   [[also not this]]",
            "   ```",
            "",
            "[[real link]]",
        ]
        .join("\n");

        assert_eq!(
            extract_wikilink_occurrences(&markdown),
            vec![WikiLinkOccurrence {
                start: 38,
                end: 51,
                title: "real link".to_string(),
                normalized_title: "real link".to_string(),
            }]
        );
    }

    #[test]
    fn extract_wikilinks_survives_unclosed_backticks() {
        let markdown = "stray ` backtick [[Real Link]] here";
        let occurrences = extract_wikilink_occurrences(markdown);
        assert_eq!(occurrences.len(), 1);
        assert_eq!(occurrences[0].title, "Real Link");
    }

    #[test]
    fn rewrite_tag_path_in_markdown_renames_exact_direct_occurrences() {
        let markdown = "hello #roadmap and #work/project-alpha";
        assert_eq!(
            rewrite_tag_path_in_markdown(markdown, "work/project-alpha", Some("work/mobile")),
            Some("hello #roadmap and #work/mobile".to_string())
        );
    }

    #[test]
    fn rewrite_wikilink_titles_in_markdown_rewrites_matching_occurrences() {
        let markdown = "hello [[Roadmap Q2]] and [[Project Alpha]]";
        let rewritten = rewrite_wikilink_titles_with_locations(
            markdown,
            &[
                WikiLinkTitleRewrite {
                    location: 6,
                    current_title: "Roadmap Q2".to_string(),
                    new_title: "Roadmap Q3".to_string(),
                },
                WikiLinkTitleRewrite {
                    location: 25,
                    current_title: "Project Alpha".to_string(),
                    new_title: "Project Beta".to_string(),
                },
            ],
        )
        .0;

        assert_eq!(rewritten, "hello [[Roadmap Q3]] and [[Project Beta]]");
    }

    #[test]
    fn rewrite_wikilink_titles_in_markdown_ignores_code_contexts() {
        let markdown = ["Use `[[Roadmap Q2]]` inline.", "", "[[Roadmap Q2]]"].join("\n");
        let rewritten = rewrite_wikilink_titles_with_locations(
            &markdown,
            &[WikiLinkTitleRewrite {
                location: 30,
                current_title: "Roadmap Q2".to_string(),
                new_title: "Roadmap Q3".to_string(),
            }],
        )
        .0;

        assert_eq!(rewritten, "Use `[[Roadmap Q2]]` inline.\n\n[[Roadmap Q3]]");
    }

    #[test]
    fn rewrite_tag_path_in_markdown_deletes_exact_direct_occurrences() {
        let markdown = "hello #roadmap and #project-alpha";
        assert_eq!(
            rewrite_tag_path_in_markdown(markdown, "project-alpha", None),
            Some("hello #roadmap and ".to_string())
        );
    }

    #[test]
    fn rewrite_tag_path_in_markdown_dedupes_rename_target_when_already_present() {
        let markdown = "#roadmap #project-alpha";
        assert_eq!(
            rewrite_tag_path_in_markdown(markdown, "project-alpha", Some("roadmap")),
            Some("#roadmap ".to_string())
        );
    }

    #[test]
    fn rewrite_tag_path_in_markdown_ignores_code_contexts() {
        let markdown = "Use `#roadmap` and #roadmap";
        assert_eq!(
            rewrite_tag_path_in_markdown(markdown, "roadmap", Some("plan")),
            Some("Use `#roadmap` and #plan".to_string())
        );
    }

    #[test]
    fn rewrite_tag_path_in_markdown_renames_descendant_tags_in_subtree() {
        let markdown = "#work/project-alpha #work/client-beta";
        assert_eq!(
            rewrite_tag_path_in_markdown(markdown, "work", Some("personal")),
            Some("#personal/project-alpha #personal/client-beta".to_string())
        );
    }

    #[test]
    fn rewrite_tag_path_in_markdown_deletes_descendant_tags_in_subtree() {
        let markdown = "#work/project-alpha #roadmap";
        assert_eq!(
            rewrite_tag_path_in_markdown(markdown, "work", None),
            Some(" #roadmap".to_string())
        );
    }

    #[test]
    fn strip_tags_from_markdown_removes_authored_tags_only() {
        let markdown = [
            "# Title",
            "",
            "#work #project-alpha",
            "",
            "Keep `#inline-code#` and [link](https://example.com/#hash).",
        ]
        .join("\n");

        let stripped = strip_tags_from_markdown(&markdown);

        assert!(!stripped.contains("#work"));
        assert!(!stripped.contains("#project-alpha"));
        assert!(stripped.contains("`#inline-code#`"));
        assert!(stripped.contains("https://example.com/#hash"));
    }
}

/**
 * Ported from app/src-tauri/src/db.rs and app/src-tauri/src/notes.rs.
 * These functions must produce identical results to the Rust implementations.
 */

function isTagChar(code: number): boolean {
  return (
    (code >= 0x30 && code <= 0x39) || // 0-9
    (code >= 0x41 && code <= 0x5a) || // A-Z
    (code >= 0x61 && code <= 0x7a) || // a-z
    code === 0x5f || // _
    code === 0x2d // -
  );
}

/**
 * Extract #tags from markdown, matching the Rust `extract_tags` in db.rs.
 * Skips fenced code blocks, inline code spans, and markdown link destinations.
 * Returns sorted, deduplicated, lowercased tags. Skips purely numeric tags.
 */
export function extractTags(markdown: string): string[] {
  const bytes = Buffer.from(markdown, "utf-8");
  const tags = new Set<string>();
  let index = 0;
  let fenceChar = 0;
  let fenceLen = 0;

  while (index < bytes.length) {
    const atLineStart = index === 0 || bytes[index - 1] === 0x0a; // \n

    // Check for fenced code block delimiter at start of line
    if (
      atLineStart &&
      index + 2 < bytes.length &&
      (bytes[index] === 0x60 || bytes[index] === 0x7e) // ` or ~
    ) {
      const ch = bytes[index];
      let run = 0;
      while (index + run < bytes.length && bytes[index + run] === ch) {
        run++;
      }
      if (run >= 3) {
        if (fenceLen === 0) {
          fenceChar = ch;
          fenceLen = run;
        } else if (ch === fenceChar && run >= fenceLen) {
          fenceChar = 0;
          fenceLen = 0;
        }
        index += run;
        while (index < bytes.length && bytes[index] !== 0x0a) {
          index++;
        }
        continue;
      }
    }

    // Skip everything inside fenced code blocks
    if (fenceLen > 0) {
      index++;
      continue;
    }

    // Skip inline code spans
    if (bytes[index] === 0x60) {
      // `
      let tickCount = 0;
      while (
        index + tickCount < bytes.length &&
        bytes[index + tickCount] === 0x60
      ) {
        tickCount++;
      }
      index += tickCount;
      // Scan for matching closing backtick run
      for (;;) {
        if (index >= bytes.length) {
          break;
        }
        if (bytes[index] === 0x60) {
          let closeCount = 0;
          while (
            index + closeCount < bytes.length &&
            bytes[index + closeCount] === 0x60
          ) {
            closeCount++;
          }
          index += closeCount;
          if (closeCount === tickCount) {
            break;
          }
        } else {
          index++;
        }
      }
      continue;
    }

    // Skip markdown link/image destinations: ](destination)
    if (
      bytes[index] === 0x5d && // ]
      index + 1 < bytes.length &&
      bytes[index + 1] === 0x28 // (
    ) {
      index += 2;
      let depth = 1;
      while (index < bytes.length && depth > 0) {
        const b = bytes[index];
        if (b === 0x5c) {
          // backslash
          index++;
          if (index < bytes.length) {
            index++;
          }
        } else if (b === 0x28) {
          // (
          depth++;
          index++;
        } else if (b === 0x29) {
          // )
          depth--;
          index++;
        } else {
          index++;
        }
      }
      continue;
    }

    if (bytes[index] !== 0x23) {
      // #
      index++;
      continue;
    }

    if (index > 0 && isTagChar(bytes[index - 1])) {
      index++;
      continue;
    }

    const tagStart = index + 1;
    if (tagStart >= bytes.length || !isTagChar(bytes[tagStart])) {
      index++;
      continue;
    }

    let tagEnd = tagStart;
    while (tagEnd < bytes.length && isTagChar(bytes[tagEnd])) {
      tagEnd++;
    }

    // Skip purely numeric tags
    const tagBytes = bytes.subarray(tagStart, tagEnd);
    let hasAlpha = false;
    for (let i = 0; i < tagBytes.length; i++) {
      const b = tagBytes[i];
      if (
        (b >= 0x41 && b <= 0x5a) || // A-Z
        (b >= 0x61 && b <= 0x7a) // a-z
      ) {
        hasAlpha = true;
        break;
      }
    }

    if (hasAlpha) {
      const tag = tagBytes.toString("utf-8").toLowerCase();
      tags.add(tag);
    }
    index = tagEnd;
  }

  return [...tags].sort();
}

/**
 * Extract title from the first `# ` heading in markdown.
 * Matches Rust `title_from_markdown` in notes.rs.
 */
export function titleFromMarkdown(markdown: string): string {
  for (const line of markdown.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      continue;
    }
    if (trimmed.startsWith("# ")) {
      const rest = trimmed.slice(2).trim();
      if (rest.length > 0) {
        return rest;
      }
    }
  }
  return "";
}

/**
 * Generate a plain-text preview from markdown.
 * Matches Rust `preview_from_markdown` in notes.rs.
 */
export function previewFromMarkdown(markdown: string): string {
  let skippedTitle = false;
  let inCodeBlock = false;
  let preview = "";

  for (const line of markdown.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock || trimmed.length === 0) {
      continue;
    }
    if (!skippedTitle && trimmed.startsWith("# ")) {
      skippedTitle = true;
      continue;
    }
    if (
      trimmed.startsWith("![") ||
      trimmed.startsWith("---") ||
      trimmed.startsWith("***")
    ) {
      continue;
    }
    const cleaned = stripMarkdownSyntax(trimmed);
    if (cleaned.length === 0) {
      continue;
    }
    if (preview.length > 0) {
      preview += " ";
    }
    preview += cleaned;
    if (preview.length >= 140) {
      break;
    }
  }

  // Truncate to 140 characters
  return [...preview].slice(0, 140).join("");
}

function stripMarkdownSyntax(line: string): string {
  let s = line;

  // Strip heading markers
  if (s.startsWith("#")) {
    s = s.replace(/^#+\s*/, "");
  }
  // Strip blockquote markers
  while (s.startsWith("> ") || s.startsWith(">")) {
    if (s.startsWith("> ")) {
      s = s.slice(2);
    } else {
      s = s.slice(1);
    }
  }
  // Strip list markers
  if (s.startsWith("- ")) {
    s = s.slice(2);
  } else if (s.startsWith("* ")) {
    s = s.slice(2);
  } else if (s.startsWith("+ ")) {
    s = s.slice(2);
  } else if (s.length > 2) {
    const m = s.match(/^(\d{1,2})[.)]\s*/);
    if (m) {
      s = s.slice(m[0].length);
    }
  }
  // Strip checkbox markers
  if (s.startsWith("[ ] ")) {
    s = s.slice(4);
  } else if (s.startsWith("[x] ")) {
    s = s.slice(4);
  } else if (s.startsWith("[ ]")) {
    s = s.slice(3);
  } else if (s.startsWith("[x]")) {
    s = s.slice(3);
  }
  s = s.trim();

  // Strip inline markdown: bold, italic, strikethrough, inline code
  s = s.replaceAll("***", "").replaceAll("**", "").replaceAll("~~", "");
  s = s.replaceAll("`", "");

  // Strip markdown links [text](url) → text
  for (;;) {
    const start = s.indexOf("[");
    if (start === -1) {
      break;
    }
    const mid = s.indexOf("](", start);
    if (mid === -1) {
      break;
    }
    const end = s.indexOf(")", mid);
    if (end === -1) {
      break;
    }
    const text = s.slice(start + 1, mid);
    s = s.slice(0, start) + text + s.slice(end + 1);
  }

  // Strip standalone emphasis markers
  s = s
    .replaceAll(" *", " ")
    .replaceAll("* ", " ")
    .replaceAll(" _", " ")
    .replaceAll("_ ", " ");
  if (s.startsWith("*") || s.startsWith("_")) {
    s = s.slice(1);
  }
  if (s.endsWith("*") || s.endsWith("_")) {
    s = s.slice(0, -1);
  }

  return s;
}

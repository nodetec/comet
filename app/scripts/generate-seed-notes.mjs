import fs from "node:fs";
import path from "node:path";

const notesDir = process.argv[2];
const nowMs = Number(process.argv[3]);

if (!notesDir || Number.isNaN(nowMs)) {
  console.error("usage: node generate-seed-notes.mjs <notes-dir> <now-ms>");
  process.exit(1);
}

const PINNED_BASENAMES = new Set([
  "01-luna-range-calibration",
  "22-pulsar-navigation-primer",
  "49-drifter-observatory-review",
]);

const ARCHIVED_BASENAMES = new Set([
  "23-ceres-dock-union-minutes",
  "36-eclipse-tour-brochure",
]);

const NOTEBOOKS = [
  ["notebook-missions", "Missions"],
  ["notebook-science", "Science"],
  ["notebook-operations", "Operations"],
  ["notebook-engineering", "Engineering"],
  ["notebook-habitat", "Habitat"],
  ["notebook-culture", "Culture"],
];

function sqlText(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function sqlNullableText(value) {
  return value == null ? "NULL" : sqlText(value);
}

function sqlNullableInteger(value) {
  return value == null ? "NULL" : String(value);
}

function stripTrailingTagSeparators(raw) {
  let normalized = raw.trim();
  while (normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1).trimEnd();
  }
  return normalized;
}

function isTagSegmentChar(character) {
  return /[\p{L}\p{N}_-]/u.test(character);
}

function isWrappedTagBodyChar(character) {
  return (
    character !== "\n" &&
    character !== "\r" &&
    (isTagSegmentChar(character) || character === "/" || /\s/u.test(character))
  );
}

function isEscapedHash(text, index) {
  let slashCount = 0;
  let current = index;

  while (current > 0 && text[current - 1] === "\\") {
    slashCount += 1;
    current -= 1;
  }

  return slashCount % 2 === 1;
}

function hasValidBoundary(text, hashIndex) {
  const previous = text[hashIndex - 1];
  if (previous == null) {
    return true;
  }

  return !(
    isTagSegmentChar(previous) ||
    previous === "/" ||
    previous === ":" ||
    previous === "."
  );
}

function hasInvalidWrappedTrailingBoundary(text, nextIndex) {
  const next = text[nextIndex];
  return (
    next != null &&
    (isTagSegmentChar(next) || next === "/" || next === ":" || next === ".")
  );
}

function hasInvalidSimpleTrailingText(text, endIndex) {
  const next = text[endIndex];
  if (next == null || !/\s/u.test(next)) {
    return false;
  }

  for (let index = endIndex + 1; index < text.length; index += 1) {
    const character = text[index];
    if (character === "\n" || character === "\r") {
      return false;
    }
    if (/\s/u.test(character)) {
      continue;
    }
    return (
      character !== "#" && (isTagSegmentChar(character) || character === "/")
    );
  }

  return false;
}

function canonicalizeTagPath(raw) {
  const normalizedRaw = stripTrailingTagSeparators(raw);
  if (!normalizedRaw) {
    return null;
  }

  const segments = normalizedRaw.split("/");
  const canonicalSegments = [];

  for (const segment of segments) {
    const normalized = segment.trim().split(/\s+/u).filter(Boolean).join(" ");
    if (!normalized) {
      return null;
    }

    let hasLetter = false;
    for (const character of normalized) {
      if (/\p{L}/u.test(character)) {
        hasLetter = true;
      }

      if (!(isTagSegmentChar(character) || character === " ")) {
        return null;
      }
    }

    if (!hasLetter) {
      return null;
    }

    canonicalSegments.push(normalized.toLocaleLowerCase());
  }

  return canonicalSegments.length > 0 ? canonicalSegments.join("/") : null;
}

function parseWrappedTag(text, startIndex) {
  const rest = text.slice(startIndex + 1);
  let sawAny = false;

  for (let offset = 0; offset < rest.length; offset += 1) {
    const character = rest[offset];
    if (!sawAny && /\s/u.test(character)) {
      return null;
    }

    if (character === "#") {
      if (offset === 0) {
        return null;
      }

      const candidate = rest.slice(0, offset);
      const canonical = canonicalizeTagPath(candidate);
      if (!canonical) {
        return null;
      }

      const end = startIndex + 1 + offset + 1;
      if (hasInvalidWrappedTrailingBoundary(text, end)) {
        return null;
      }

      return { canonical, end };
    }

    if (!isWrappedTagBodyChar(character)) {
      return null;
    }

    sawAny = true;
  }

  return null;
}

function parseSimpleTag(text, startIndex) {
  let end = startIndex + 1;

  while (end < text.length) {
    const character = text[end];
    if (isTagSegmentChar(character) || character === "/") {
      end += 1;
      continue;
    }
    break;
  }

  if (end === startIndex + 1) {
    return null;
  }

  const candidate = text.slice(startIndex + 1, end);
  const canonical = canonicalizeTagPath(candidate);
  if (!canonical) {
    return null;
  }

  if (
    !candidate.trimEnd().endsWith("/") &&
    hasInvalidSimpleTrailingText(text, end)
  ) {
    return null;
  }

  return { canonical, end };
}

function extractTags(markdown) {
  const tags = new Set();

  for (let index = 0; index < markdown.length; index += 1) {
    if (markdown[index] !== "#") {
      continue;
    }

    if (isEscapedHash(markdown, index) || !hasValidBoundary(markdown, index)) {
      continue;
    }

    const wrapped = parseWrappedTag(markdown, index);
    if (wrapped) {
      tags.add(wrapped.canonical);
      index = wrapped.end - 1;
      continue;
    }

    const simple = parseSimpleTag(markdown, index);
    if (simple) {
      tags.add(simple.canonical);
      index = simple.end - 1;
    }
  }

  return [...tags].sort((left, right) => left.localeCompare(right));
}

function ancestorTagPaths(pathValue) {
  const segments = pathValue.split("/");
  const ancestors = [];
  for (let depth = 1; depth < segments.length; depth += 1) {
    ancestors.push(segments.slice(0, depth).join("/"));
  }
  return ancestors;
}

function titleFromMarkdown(markdown, basename) {
  for (const line of markdown.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("# ")) {
      const title = trimmed.slice(2).trim();
      if (title) {
        return title;
      }
    }
  }

  return basename
    .replace(/^\d+-/, "")
    .split("-")
    .map((segment) => segment[0].toUpperCase() + segment.slice(1))
    .join(" ");
}

function chooseNotebookId(tags, basename) {
  const hasTag = (value) =>
    tags.some((tag) => tag === value || tag.startsWith(`${value}/`));

  if (tags.length === 0 || basename === "44-red-dust-postcard") {
    return null;
  }
  if (hasTag("missions")) {
    return "notebook-missions";
  }
  if (hasTag("engineering") || tags.includes("navigation")) {
    return "notebook-engineering";
  }
  if (
    hasTag("operations") ||
    hasTag("logistics") ||
    tags.includes("policy") ||
    tags.includes("safety") ||
    tags.includes("signals") ||
    tags.includes("commerce") ||
    tags.includes("training") ||
    tags.includes("recovery") ||
    tags.includes("briefings") ||
    tags.includes("supply chain")
  ) {
    return "notebook-operations";
  }
  if (
    hasTag("habitats") ||
    tags.some((tag) => tag.startsWith("crew/")) ||
    tags.includes("long haul")
  ) {
    return "notebook-habitat";
  }
  if (
    hasTag("writing") ||
    hasTag("culture") ||
    tags.includes("reviews") ||
    tags.includes("field sketch") ||
    tags.includes("night sky") ||
    tags.includes("tourism")
  ) {
    return "notebook-culture";
  }
  return "notebook-science";
}

const files = fs
  .readdirSync(notesDir)
  .filter((file) => file.endsWith(".md"))
  .sort((left, right) => left.localeCompare(right));

if (files.length !== 50) {
  console.error(`expected 50 markdown notes, found ${files.length}`);
  process.exit(1);
}

const hourMs = 60 * 60 * 1000;
const minuteMs = 60 * 1000;

const notes = files.map((file, index) => {
  const basename = file.replace(/\.md$/u, "");
  const noteId = `note-${basename}`;
  const markdown = fs
    .readFileSync(path.join(notesDir, file), "utf8")
    .replaceAll("\r\n", "\n");
  const tags = extractTags(markdown);
  const title = titleFromMarkdown(markdown, basename);
  const editedAt =
    nowMs - (index * 7 * hourMs + (index % 5) * 19 * minuteMs + hourMs);
  const archivedAt = ARCHIVED_BASENAMES.has(basename) ? editedAt : null;
  const pinnedAt =
    !archivedAt && PINNED_BASENAMES.has(basename) ? editedAt + 60 * 1000 : null;

  return {
    id: noteId,
    title,
    markdown,
    tags,
    notebookId: chooseNotebookId(tags, basename),
    createdAt: editedAt,
    modifiedAt: editedAt,
    editedAt,
    archivedAt,
    pinnedAt,
  };
});

const tagMeta = new Map();
const noteLinks = [];

for (const note of notes) {
  const links = new Map();

  for (const directTag of note.tags) {
    links.set(directTag, 1);

    for (const ancestor of ancestorTagPaths(directTag)) {
      if (!links.has(ancestor)) {
        links.set(ancestor, 0);
      }
    }
  }

  for (const tagPath of links.keys()) {
    if (!tagMeta.has(tagPath)) {
      const segments = tagPath.split("/");
      const parentPath =
        segments.length > 1 ? segments.slice(0, -1).join("/") : null;
      tagMeta.set(tagPath, {
        path: tagPath,
        parentPath,
        lastSegment: segments.at(-1),
        depth: segments.length,
      });
    }
  }

  for (const [tagPath, isDirect] of [...links.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    noteLinks.push({
      noteId: note.id,
      tagPath,
      isDirect,
    });
  }
}

const sortedTags = [...tagMeta.values()].sort(
  (left, right) =>
    left.depth - right.depth || left.path.localeCompare(right.path),
);
const tagIds = new Map(sortedTags.map((tag, index) => [tag.path, index + 1]));

const notebookSql = NOTEBOOKS.map(
  ([id, name]) => `  (${sqlText(id)}, ${sqlText(name)}, ${nowMs}, ${nowMs})`,
).join(",\n");

const notesSql = notes
  .map(
    (note) => `  (
    ${sqlText(note.id)},
    ${sqlText(note.title)},
    ${sqlText(note.markdown)},
    ${sqlNullableText(note.notebookId)},
    ${note.createdAt},
    ${note.modifiedAt},
    ${note.editedAt},
    ${sqlNullableInteger(note.archivedAt)},
    ${sqlNullableInteger(note.pinnedAt)}
  )`,
  )
  .join(",\n");

const tagsSql = sortedTags
  .map(
    (tag) => `  (
    ${tagIds.get(tag.path)},
    ${sqlText(tag.path)},
    ${sqlNullableInteger(tag.parentPath ? tagIds.get(tag.parentPath) : null)},
    ${sqlText(tag.lastSegment)},
    ${tag.depth},
    0,
    0,
    NULL,
    ${nowMs},
    ${nowMs}
  )`,
  )
  .join(",\n");

const noteLinksSql = noteLinks
  .map(
    (link) =>
      `  (${sqlText(link.noteId)}, ${tagIds.get(link.tagPath)}, ${link.isDirect})`,
  )
  .join(",\n");

process.stdout
  .write(`INSERT INTO notebooks (id, name, created_at, updated_at) VALUES
${notebookSql};

INSERT INTO notes (
  id,
  title,
  markdown,
  notebook_id,
  created_at,
  modified_at,
  edited_at,
  archived_at,
  pinned_at
) VALUES
${notesSql};

INSERT INTO tags (
  id,
  path,
  parent_id,
  last_segment,
  depth,
  pinned,
  hide_subtag_notes,
  icon,
  created_at,
  updated_at
) VALUES
${tagsSql};

INSERT INTO note_tag_links (note_id, tag_id, is_direct) VALUES
${noteLinksSql};
`);

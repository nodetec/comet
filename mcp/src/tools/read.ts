import type { DB } from "../db";
import { previewFromMarkdown } from "../lib/markdown";
import type {
  LoadedNote,
  NoteFilter,
  NotePagePayload,
  NoteSortDirection,
  NoteSortField,
  NoteSummary,
  NotebookSummary,
  SearchResult,
} from "../lib/types";

const MAX_PAGE_SIZE = 100;
const SEARCH_RESULTS_LIMIT = 20;

// --- Search helpers (ported from notes.rs) ---

function searchTokensFromQuery(query: string): string[] {
  return query
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

function escapeLikePattern(token: string): string {
  let escaped = "";
  for (const ch of token) {
    if (ch === "%" || ch === "_" || ch === "\\") {
      escaped += "\\";
    }
    escaped += ch;
  }
  return escaped;
}

type SearchMode =
  | { type: "match"; query: string }
  | { type: "like"; patterns: string[] };

function searchModeFromTokens(tokens: string[]): SearchMode | null {
  if (tokens.length === 0) {
    return null;
  }
  if (tokens.some((t) => [...t].length < 3)) {
    return {
      type: "like",
      patterns: tokens.map((t) => `%${escapeLikePattern(t)}%`),
    };
  }
  const matchQuery = tokens
    .map((t) => `"${t.replaceAll('"', '""')}"`)
    .join(" AND ");
  return { type: "match", query: matchQuery };
}

// --- Search snippet helpers (ported from notes.rs) ---

function searchableMarkdownText(markdown: string): string {
  return markdown
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("```"))
    .join(" ");
}

function previousWordBoundary(text: string, index: number): number {
  let boundary = 0;
  let charIndex = 0;
  for (const ch of text) {
    if (charIndex >= index) {
      break;
    }
    if (/\s/.test(ch)) {
      boundary = charIndex + ch.length;
    }
    charIndex += ch.length;
  }
  return boundary;
}

function nextWordBoundary(text: string, index: number): number {
  let charIndex = 0;
  for (const ch of text) {
    if (charIndex >= index && /\s/.test(ch)) {
      return charIndex;
    }
    charIndex += ch.length;
  }
  return text.length;
}

function trimSnippetBoundary(snippet: string): string {
  return snippet.replace(/^[\s.,;:!?)([\]{}]+|[\s.,;:!?)([\]{}]+$/g, "");
}

function searchSnippetFromMarkdown(
  markdown: string,
  searchTokens: string[],
): string | null {
  if (searchTokens.length === 0) {
    return null;
  }
  const text = searchableMarkdownText(markdown);
  if (text.length === 0) {
    return null;
  }
  const normalizedText = text.toLowerCase();
  let firstMatch: { start: number; end: number } | null = null;
  for (const token of searchTokens) {
    const normalized = token.trim().toLowerCase();
    if (normalized.length === 0) {
      continue;
    }
    const idx = normalizedText.indexOf(normalized);
    if (idx !== -1) {
      const end = idx + normalized.length;
      if (!firstMatch || idx < firstMatch.start) {
        firstMatch = { start: idx, end };
      }
    }
  }
  if (!firstMatch) {
    return null;
  }

  const prefixTarget = 52;
  const suffixTarget = 84;
  const windowStart = Math.max(0, firstMatch.start - prefixTarget);
  const windowEnd = Math.min(text.length, firstMatch.end + suffixTarget);
  const start = previousWordBoundary(text, windowStart);
  const end = nextWordBoundary(text, windowEnd);

  let snippet = trimSnippetBoundary(text.slice(start, end));
  if (snippet.length === 0) {
    return null;
  }
  if (start > 0) {
    snippet = `…${snippet}`;
  }
  if (end < text.length) {
    snippet += "…";
  }
  return snippet;
}

// --- Filter clause builder (ported from notes.rs) ---

function appendNoteViewClauses(
  clauses: string[],
  values: unknown[],
  filter: NoteFilter,
  notebookId: string | undefined,
): void {
  switch (filter) {
    case "all": {
      clauses.push("n.archived_at IS NULL");
      clauses.push("n.deleted_at IS NULL");
      break;
    }
    case "today": {
      clauses.push("n.archived_at IS NULL");
      clauses.push("n.deleted_at IS NULL");
      clauses.push("n.edited_at >= ?");
      values.push(Date.now() - 24 * 60 * 60 * 1000);
      break;
    }
    case "todo": {
      clauses.push("n.archived_at IS NULL");
      clauses.push("n.deleted_at IS NULL");
      clauses.push("n.markdown LIKE '%- [ ] %'");
      break;
    }
    case "archive": {
      clauses.push("n.archived_at IS NOT NULL");
      clauses.push("n.deleted_at IS NULL");
      break;
    }
    case "trash": {
      clauses.push("n.deleted_at IS NOT NULL");
      break;
    }
    case "notebook": {
      clauses.push("n.archived_at IS NULL");
      clauses.push("n.deleted_at IS NULL");
      clauses.push("n.notebook_id = ?");
      values.push(notebookId ?? "");
      break;
    }
  }
}

// --- Tool implementations ---

export function listNotes(
  db: DB,
  input: {
    filter?: NoteFilter;
    notebookId?: string;
    search?: string;
    tags?: string[];
    limit?: number;
    offset?: number;
    sort?: NoteSortField;
    direction?: NoteSortDirection;
  },
): NotePagePayload {
  const filter: NoteFilter = input.filter ?? "all";
  const limit = Math.min(Math.max(input.limit ?? 40, 1), MAX_PAGE_SIZE);
  const offset = input.offset ?? 0;
  const sortField = input.sort ?? "modified_at";
  const sortDirection = input.direction ?? "newest";
  const activeTags = (input.tags ?? []).map((t) => t.toLowerCase());

  if (filter === "notebook" && !input.notebookId) {
    return { notes: [], hasMore: false, nextOffset: null, totalCount: 0 };
  }

  const searchTokens = searchTokensFromQuery(input.search ?? "");
  const searchMode = searchModeFromTokens(searchTokens);

  let sql: string;
  const clauses: string[] = [];
  const values: unknown[] = [];

  if (searchMode?.type === "match") {
    sql = `SELECT n.id, n.title, n.markdown, n.modified_at, b.id, b.name, n.archived_at, n.deleted_at, n.pinned_at
           FROM notes n
           LEFT JOIN notebooks b ON b.id = n.notebook_id
           JOIN notes_fts ON notes_fts.note_id = n.id`;
    clauses.push("notes_fts MATCH ?");
    values.push(searchMode.query);
  } else if (searchMode?.type === "like") {
    sql = `SELECT n.id, n.title, n.markdown, n.edited_at, b.id, b.name, n.archived_at, n.deleted_at, n.pinned_at
           FROM notes n
           LEFT JOIN notebooks b ON b.id = n.notebook_id
           JOIN notes_fts ON notes_fts.note_id = n.id`;
    for (const pattern of searchMode.patterns) {
      clauses.push(
        String.raw`(notes_fts.title LIKE ? ESCAPE '\' OR notes_fts.markdown LIKE ? ESCAPE '\')`,
      );
      values.push(pattern, pattern);
    }
  } else {
    sql = `SELECT n.id, n.title, n.markdown, n.edited_at, b.id, b.name, n.archived_at, n.deleted_at, n.pinned_at
           FROM notes n
           LEFT JOIN notebooks b ON b.id = n.notebook_id`;
  }

  appendNoteViewClauses(clauses, values, filter, input.notebookId);

  for (const tag of activeTags) {
    clauses.push(
      "EXISTS (SELECT 1 FROM note_tags nt_filter WHERE nt_filter.note_id = n.id AND nt_filter.tag = ?)",
    );
    values.push(tag);
  }

  const whereClause =
    clauses.length > 0 ? ` WHERE ${clauses.join(" AND ")}` : "";

  // Count query (only on first page)
  let totalCount = 0;
  if (offset === 0) {
    const countSql = searchMode
      ? `SELECT COUNT(*) FROM notes n JOIN notes_fts ON notes_fts.note_id = n.id${whereClause}`
      : `SELECT COUNT(*) FROM notes n${whereClause}`;
    const row = db.prepare(countSql).get(...values) as {
      "COUNT(*)": number;
    } | null;
    totalCount = row?.["COUNT(*)"] ?? 0;
  }

  sql += whereClause;

  // Sort
  const sortColumn =
    sortField === "created_at"
      ? "n.created_at"
      : sortField === "title"
        ? "n.title"
        : "n.edited_at";
  let sortDir: string;
  if (sortField === "title") {
    sortDir = sortDirection === "newest" ? "ASC" : "DESC";
  } else {
    sortDir = sortDirection === "newest" ? "DESC" : "ASC";
  }

  sql += ` ORDER BY n.pinned_at IS NULL ASC, n.pinned_at DESC, ${sortColumn} ${sortDir}, n.created_at DESC`;
  sql += " LIMIT ? OFFSET ?";
  values.push(limit + 1, offset);

  const rows = db.prepare(sql).all(...values);
  const hasMore = rows.length > limit;
  if (hasMore) {
    rows.pop();
  }

  const notes: NoteSummary[] = rows.map((row) => {
    const markdown = row.markdown as string;
    const notebookId = row["b.id"] as string | null;
    const notebookName = row["b.name"] as string | null;
    return {
      id: row["n.id"] as string,
      title: row["n.title"] as string,
      notebook:
        notebookId && notebookName
          ? { id: notebookId, name: notebookName }
          : null,
      editedAt: row["n.edited_at"] as number,
      preview:
        searchSnippetFromMarkdown(markdown, searchTokens) ??
        previewFromMarkdown(markdown),
      archivedAt: (row["n.archived_at"] as number | null) ?? null,
      deletedAt: (row["n.deleted_at"] as number | null) ?? null,
      pinnedAt: (row["n.pinned_at"] as number | null) ?? null,
    };
  });

  return {
    notes,
    hasMore,
    nextOffset: hasMore ? offset + limit : null,
    totalCount,
  };
}

export function readNote(db: DB, noteId: string): LoadedNote | null {
  const row = db
    .prepare(
      `SELECT n.id, n.title, n.markdown, n.modified_at, n.archived_at, n.deleted_at, n.pinned_at,
              b.id AS notebook_id, b.name AS notebook_name
       FROM notes n
       LEFT JOIN notebooks b ON b.id = n.notebook_id
       WHERE n.id = ?`,
    )
    .get(noteId);

  if (!row) {
    return null;
  }

  const tagRows = db
    .prepare("SELECT tag FROM note_tags WHERE note_id = ? ORDER BY tag ASC")
    .all(noteId) as { tag: string }[];

  const notebookId = row.notebook_id as string | null;
  const notebookName = row.notebook_name as string | null;

  return {
    id: row.id as string,
    title: row.title as string,
    markdown: row.markdown as string,
    modifiedAt: row.modified_at as number,
    notebook:
      notebookId && notebookName
        ? { id: notebookId, name: notebookName }
        : null,
    archivedAt: (row.archived_at as number | null) ?? null,
    deletedAt: (row.deleted_at as number | null) ?? null,
    pinnedAt: (row.pinned_at as number | null) ?? null,
    tags: tagRows.map((r) => r.tag),
  };
}

export function searchNotes(db: DB, query: string): SearchResult[] {
  const searchTokens = searchTokensFromQuery(query);
  const searchMode = searchModeFromTokens(searchTokens);
  if (!searchMode) {
    return [];
  }

  let sql: string;
  const values: unknown[] = [];

  if (searchMode.type === "match") {
    sql = `SELECT n.id, n.title, n.markdown, b.id AS notebook_id, b.name AS notebook_name, n.archived_at
           FROM notes n
           LEFT JOIN notebooks b ON b.id = n.notebook_id
           JOIN notes_fts ON notes_fts.note_id = n.id
           WHERE notes_fts MATCH ?
           ORDER BY n.pinned_at IS NULL ASC, n.edited_at DESC
           LIMIT ?`;
    values.push(searchMode.query, SEARCH_RESULTS_LIMIT + 1);
  } else {
    const likeClauses = searchMode.patterns.map(
      () =>
        String.raw`(notes_fts.title LIKE ? ESCAPE '\' OR notes_fts.markdown LIKE ? ESCAPE '\')`,
    );
    for (const pattern of searchMode.patterns) {
      values.push(pattern, pattern);
    }
    sql = `SELECT n.id, n.title, n.markdown, b.id AS notebook_id, b.name AS notebook_name, n.archived_at
           FROM notes n
           LEFT JOIN notebooks b ON b.id = n.notebook_id
           JOIN notes_fts ON notes_fts.note_id = n.id
           WHERE ${likeClauses.join(" AND ")}
           ORDER BY n.pinned_at IS NULL ASC, n.edited_at DESC
           LIMIT ?`;
    values.push(SEARCH_RESULTS_LIMIT + 1);
  }

  const rows = db.prepare(sql).all(...values);

  return rows.slice(0, SEARCH_RESULTS_LIMIT).map((row) => {
    const markdown = row.markdown as string;
    const notebookId = row.notebook_id as string | null;
    const notebookName = row.notebook_name as string | null;
    return {
      id: row.id as string,
      title: row.title as string,
      notebook:
        notebookId && notebookName
          ? { id: notebookId, name: notebookName }
          : null,
      preview:
        searchSnippetFromMarkdown(markdown, searchTokens) ??
        previewFromMarkdown(markdown),
      archivedAt: (row.archived_at as number | null) ?? null,
    };
  });
}

export function listNotebooks(db: DB): NotebookSummary[] {
  const rows = db
    .prepare(
      `SELECT b.id, b.name, COUNT(n.id) AS note_count
       FROM notebooks b
       LEFT JOIN notes n ON n.notebook_id = b.id AND n.archived_at IS NULL AND n.deleted_at IS NULL
       GROUP BY b.id
       ORDER BY b.name ASC`,
    )
    .all() as { id: string; name: string; note_count: number }[];

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    noteCount: r.note_count,
  }));
}

export function listTags(db: DB, query?: string): string[] {
  if (!query || query.trim().length === 0) {
    const rows = db
      .prepare(
        `SELECT tag, COUNT(*) AS freq FROM note_tags GROUP BY tag ORDER BY freq DESC, tag ASC LIMIT 50`,
      )
      .all() as { tag: string }[];
    return rows.map((r) => r.tag);
  }

  const escaped = escapeLikePattern(query.toLowerCase());
  const containsPattern = `%${escaped}%`;
  const prefixPattern = `${escaped}%`;

  const rows = db
    .prepare(
      `SELECT tag, COUNT(*) AS freq,
              CASE WHEN tag LIKE ? ESCAPE '\\' THEN 0 ELSE 1 END AS rank
       FROM note_tags
       WHERE tag LIKE ? ESCAPE '\\'
       GROUP BY tag
       ORDER BY rank ASC, freq DESC, tag ASC
       LIMIT 20`,
    )
    .all(prefixPattern, containsPattern) as { tag: string }[];

  return rows.map((r) => r.tag);
}

export function getStats(db: DB): {
  totalNotes: number;
  activeNotes: number;
  archivedNotes: number;
  trashedNotes: number;
  todoNotes: number;
  notebooks: number;
  tags: number;
} {
  const total =
    (
      db.prepare("SELECT COUNT(*) AS c FROM notes").get() as {
        c: number;
      } | null
    )?.c ?? 0;
  const active =
    (
      db
        .prepare(
          "SELECT COUNT(*) AS c FROM notes WHERE archived_at IS NULL AND deleted_at IS NULL",
        )
        .get() as { c: number } | null
    )?.c ?? 0;
  const archived =
    (
      db
        .prepare(
          "SELECT COUNT(*) AS c FROM notes WHERE archived_at IS NOT NULL AND deleted_at IS NULL",
        )
        .get() as { c: number } | null
    )?.c ?? 0;
  const trashed =
    (
      db
        .prepare("SELECT COUNT(*) AS c FROM notes WHERE deleted_at IS NOT NULL")
        .get() as { c: number } | null
    )?.c ?? 0;
  const todo =
    (
      db
        .prepare(
          "SELECT COUNT(*) AS c FROM notes WHERE archived_at IS NULL AND deleted_at IS NULL AND markdown LIKE '%- [ ] %'",
        )
        .get() as { c: number } | null
    )?.c ?? 0;
  const notebooks =
    (
      db.prepare("SELECT COUNT(*) AS c FROM notebooks").get() as {
        c: number;
      } | null
    )?.c ?? 0;
  const tags =
    (
      db.prepare("SELECT COUNT(DISTINCT tag) AS c FROM note_tags").get() as {
        c: number;
      } | null
    )?.c ?? 0;

  return {
    totalNotes: total,
    activeNotes: active,
    archivedNotes: archived,
    trashedNotes: trashed,
    todoNotes: todo,
    notebooks,
    tags,
  };
}

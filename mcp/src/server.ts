import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { type DB, withDatabase } from "./db";
import {
  getStats,
  listNotes,
  listNotebooks,
  listTags,
  readNote,
  searchNotes,
} from "./tools/read";
import {
  archiveNote,
  assignNotebook,
  createNote,
  createNotebook,
  pinNote,
  restoreFromTrash,
  restoreNote,
  trashNote,
  unpinNote,
  updateNote,
} from "./tools/write";

function successResult(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
  };
}

function errorResult(error: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: error instanceof Error ? error.message : String(error),
      },
    ],
    isError: true,
  };
}

function runTool<T>(fn: (db: DB) => T) {
  try {
    return successResult(withDatabase(fn));
  } catch (error) {
    return errorResult(error);
  }
}

export function createServer(): McpServer {
  const server = new McpServer({
    name: "comet-notes",
    version: "0.1.0",
  });

  server.tool(
    "list_notes",
    "Query notes with filtering, sorting, and pagination. Returns note summaries (not full markdown).",
    {
      filter: z
        .enum(["all", "today", "todo", "archive", "trash", "notebook"])
        .optional()
        .describe("Filter notes by view (default: all)"),
      notebookId: z
        .string()
        .optional()
        .describe("Required when filter is 'notebook'"),
      search: z.string().optional().describe("Search query text"),
      tags: z
        .array(z.string())
        .optional()
        .describe("Filter by tags (AND logic)"),
      limit: z
        .number()
        .optional()
        .describe("Page size (default: 40, max: 100)"),
      offset: z.number().optional().describe("Pagination offset (default: 0)"),
      sort: z
        .enum(["modified_at", "created_at", "title"])
        .optional()
        .describe("Sort field (default: modified_at)"),
      direction: z
        .enum(["newest", "oldest"])
        .optional()
        .describe("Sort direction (default: newest)"),
    },
    (args) => runTool((db) => listNotes(db, args)),
  );

  server.tool(
    "read_note",
    "Load a single note by ID. Returns full markdown content and metadata.",
    {
      noteId: z.string().describe("The note ID to load"),
    },
    (args) =>
      runTool((db) => {
        const note = readNote(db, args.noteId);
        if (!note) {
          throw new Error("Note not found.");
        }
        return note;
      }),
  );

  server.tool(
    "search_notes",
    "Full-text search across all notes. Returns up to 20 results with preview snippets.",
    {
      query: z.string().describe("Search query"),
    },
    (args) => runTool((db) => searchNotes(db, args.query)),
  );

  server.tool(
    "list_notebooks",
    "List all notebooks with their note counts.",
    {},
    () => runTool((db) => listNotebooks(db)),
  );

  server.tool(
    "list_tags",
    "List or search tags. Without a query, returns the most-used tags.",
    {
      query: z
        .string()
        .optional()
        .describe("Optional search query to filter tags"),
    },
    (args) => runTool((db) => listTags(db, args.query)),
  );

  server.tool(
    "get_stats",
    "Get note and notebook statistics (counts of active, archived, trashed, todo notes).",
    {},
    () => runTool((db) => getStats(db)),
  );

  server.tool(
    "create_note",
    "Create a new note. Returns the created note with ID and metadata.",
    {
      markdown: z
        .string()
        .optional()
        .describe("Initial markdown content (default: empty note with '# ')"),
      notebookId: z
        .string()
        .optional()
        .describe("Notebook to assign the note to"),
    },
    (args) => runTool((db) => createNote(db, args)),
  );

  server.tool(
    "update_note",
    "Update a note's markdown content. Automatically extracts title and tags.",
    {
      noteId: z.string().describe("The note ID to update"),
      markdown: z.string().describe("The new markdown content"),
    },
    (args) => runTool((db) => updateNote(db, args)),
  );

  server.tool(
    "create_notebook",
    "Create a new notebook.",
    {
      name: z.string().describe("The notebook name (max 80 chars)"),
    },
    (args) => runTool((db) => createNotebook(db, args.name)),
  );

  server.tool(
    "archive_note",
    "Archive a note (soft-delete, can be restored).",
    {
      noteId: z.string().describe("The note ID to archive"),
    },
    (args) => runTool((db) => archiveNote(db, args.noteId)),
  );

  server.tool(
    "restore_note",
    "Restore a note from the archive.",
    {
      noteId: z.string().describe("The note ID to restore"),
    },
    (args) => runTool((db) => restoreNote(db, args.noteId)),
  );

  server.tool(
    "trash_note",
    "Move a note to the trash (can be restored).",
    {
      noteId: z.string().describe("The note ID to trash"),
    },
    (args) => runTool((db) => trashNote(db, args.noteId)),
  );

  server.tool(
    "restore_from_trash",
    "Restore a note from the trash.",
    {
      noteId: z.string().describe("The note ID to restore from trash"),
    },
    (args) => runTool((db) => restoreFromTrash(db, args.noteId)),
  );

  server.tool(
    "pin_note",
    "Pin a note to the top of lists.",
    {
      noteId: z.string().describe("The note ID to pin"),
    },
    (args) => runTool((db) => pinNote(db, args.noteId)),
  );

  server.tool(
    "unpin_note",
    "Unpin a note.",
    {
      noteId: z.string().describe("The note ID to unpin"),
    },
    (args) => runTool((db) => unpinNote(db, args.noteId)),
  );

  server.tool(
    "assign_notebook",
    "Assign a note to a notebook or remove it from its current notebook.",
    {
      noteId: z.string().describe("The note ID"),
      notebookId: z
        .string()
        .nullable()
        .describe("The notebook ID to assign to, or null to remove"),
    },
    (args) => runTool((db) => assignNotebook(db, args.noteId, args.notebookId)),
  );

  return server;
}

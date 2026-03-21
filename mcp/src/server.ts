import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
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

export function createServer(): McpServer {
  const server = new McpServer({
    name: "comet-notes",
    version: "0.1.0",
  });

  // --- Read Tools ---

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
    (args) => {
      const result = listNotes(args);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  server.tool(
    "read_note",
    "Load a single note by ID. Returns full markdown content and metadata.",
    {
      noteId: z.string().describe("The note ID to load"),
    },
    (args) => {
      const note = readNote(args.noteId);
      if (!note) {
        return {
          content: [{ type: "text", text: "Note not found." }],
          isError: true,
        };
      }
      return {
        content: [{ type: "text", text: JSON.stringify(note, null, 2) }],
      };
    },
  );

  server.tool(
    "search_notes",
    "Full-text search across all notes. Returns up to 20 results with preview snippets.",
    {
      query: z.string().describe("Search query"),
    },
    (args) => {
      const results = searchNotes(args.query);
      return {
        content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
      };
    },
  );

  server.tool(
    "list_notebooks",
    "List all notebooks with their note counts.",
    {},
    () => {
      const notebooks = listNotebooks();
      return {
        content: [{ type: "text", text: JSON.stringify(notebooks, null, 2) }],
      };
    },
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
    (args) => {
      const tags = listTags(args.query);
      return {
        content: [{ type: "text", text: JSON.stringify(tags, null, 2) }],
      };
    },
  );

  server.tool(
    "get_stats",
    "Get note and notebook statistics (counts of active, archived, trashed, todo notes).",
    {},
    () => {
      const stats = getStats();
      return {
        content: [{ type: "text", text: JSON.stringify(stats, null, 2) }],
      };
    },
  );

  // --- Write Tools ---

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
    (args) => {
      try {
        const note = createNote(args);
        return {
          content: [{ type: "text", text: JSON.stringify(note, null, 2) }],
        };
      } catch (e) {
        return {
          content: [
            { type: "text", text: e instanceof Error ? e.message : String(e) },
          ],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "update_note",
    "Update a note's markdown content. Automatically extracts title and tags.",
    {
      noteId: z.string().describe("The note ID to update"),
      markdown: z.string().describe("The new markdown content"),
    },
    (args) => {
      try {
        const note = updateNote(args);
        return {
          content: [{ type: "text", text: JSON.stringify(note, null, 2) }],
        };
      } catch (e) {
        return {
          content: [
            { type: "text", text: e instanceof Error ? e.message : String(e) },
          ],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "create_notebook",
    "Create a new notebook.",
    {
      name: z.string().describe("The notebook name (max 80 chars)"),
    },
    (args) => {
      try {
        const notebook = createNotebook(args.name);
        return {
          content: [{ type: "text", text: JSON.stringify(notebook, null, 2) }],
        };
      } catch (e) {
        return {
          content: [
            { type: "text", text: e instanceof Error ? e.message : String(e) },
          ],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "archive_note",
    "Archive a note (soft-delete, can be restored).",
    {
      noteId: z.string().describe("The note ID to archive"),
    },
    (args) => {
      try {
        const note = archiveNote(args.noteId);
        return {
          content: [{ type: "text", text: JSON.stringify(note, null, 2) }],
        };
      } catch (e) {
        return {
          content: [
            { type: "text", text: e instanceof Error ? e.message : String(e) },
          ],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "restore_note",
    "Restore a note from the archive.",
    {
      noteId: z.string().describe("The note ID to restore"),
    },
    (args) => {
      try {
        const note = restoreNote(args.noteId);
        return {
          content: [{ type: "text", text: JSON.stringify(note, null, 2) }],
        };
      } catch (e) {
        return {
          content: [
            { type: "text", text: e instanceof Error ? e.message : String(e) },
          ],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "trash_note",
    "Move a note to the trash (can be restored).",
    {
      noteId: z.string().describe("The note ID to trash"),
    },
    (args) => {
      try {
        const note = trashNote(args.noteId);
        return {
          content: [{ type: "text", text: JSON.stringify(note, null, 2) }],
        };
      } catch (e) {
        return {
          content: [
            { type: "text", text: e instanceof Error ? e.message : String(e) },
          ],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "restore_from_trash",
    "Restore a note from the trash.",
    {
      noteId: z.string().describe("The note ID to restore from trash"),
    },
    (args) => {
      try {
        const note = restoreFromTrash(args.noteId);
        return {
          content: [{ type: "text", text: JSON.stringify(note, null, 2) }],
        };
      } catch (e) {
        return {
          content: [
            { type: "text", text: e instanceof Error ? e.message : String(e) },
          ],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "pin_note",
    "Pin a note to the top of lists.",
    {
      noteId: z.string().describe("The note ID to pin"),
    },
    (args) => {
      try {
        const note = pinNote(args.noteId);
        return {
          content: [{ type: "text", text: JSON.stringify(note, null, 2) }],
        };
      } catch (e) {
        return {
          content: [
            { type: "text", text: e instanceof Error ? e.message : String(e) },
          ],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "unpin_note",
    "Unpin a note.",
    {
      noteId: z.string().describe("The note ID to unpin"),
    },
    (args) => {
      try {
        const note = unpinNote(args.noteId);
        return {
          content: [{ type: "text", text: JSON.stringify(note, null, 2) }],
        };
      } catch (e) {
        return {
          content: [
            { type: "text", text: e instanceof Error ? e.message : String(e) },
          ],
          isError: true,
        };
      }
    },
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
    (args) => {
      try {
        const note = assignNotebook(args.noteId, args.notebookId);
        return {
          content: [{ type: "text", text: JSON.stringify(note, null, 2) }],
        };
      } catch (e) {
        return {
          content: [
            { type: "text", text: e instanceof Error ? e.message : String(e) },
          ],
          isError: true,
        };
      }
    },
  );

  return server;
}

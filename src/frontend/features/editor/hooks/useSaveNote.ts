import { $convertToMarkdownString, type Transformer } from "@lexical/markdown";
import {
  useMutation,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { parseTitle } from "~/lib/markdown";
import { type Note } from "$/types/Note";
import { type EditorState, type LexicalEditor } from "lexical";

// TODO: more complex way to decide when to invalidate queries

// type Page<T> = {
//   data: T[] | undefined;
//   nextPage: number | undefined;
//   nextCursor: number | undefined;
//   prevCursor: number | undefined;
// };

// export type InfiniteQueryData<T> = {
//   pageParams: number[];
//   pages: Page<T>[] | undefined;
// };

// const queryKey = [
//   "notes",
//   activeNotebook?.ID,
//   activeTag?.ID,
//   noteSearch,
//   orderBy,
//   timeSortDirection,
//   titleSortDirection,
// ];
// // eslint-disable-next-line @typescript-eslint/non-nullable-type-assertion-style
// const data = queryClient.getQueryData(queryKey) as InfiniteQueryData<Note>;
// console.log("data", data);
// if (!activeNote) return;
// if (!data) return;
// if (!data.pages) return;
// // get all of the notes from the first page
// const notes = data.pages[0].data;
// // if there are no notes, return
// if (!notes) return;
// // get the first note
// const firstNote = notes[0];
// console.log("firstNote", firstNote);
// // if there is no first note, return
// if (!firstNote) return;
// // if the first note is the active note, return
// if (firstNote.ID === activeNote?.ID) return;
// void queryClient.invalidateQueries({
//   queryKey,
// });

// get all notes
// check if active note is first note
// if not then invalidate queries so that this note is moved to top

async function saveNote(
  note: Note | undefined | null,
  editor: LexicalEditor | EditorState,
  transformers: Transformer[],
  queryClient: QueryClient,
  shouldInvalidate: boolean,
) {
  if (!note) {
    console.error("No active note found");
    return;
  }

  await editor.read(async () => {
    console.log("saving note", note);
    const markdownText = $convertToMarkdownString(transformers);

    const noteToUpdate = await window.api.getNote(note._id);

    if (noteToUpdate?.content === markdownText) {
      return;
    }

    note.content = markdownText;
    note.title = parseTitle(markdownText);
    await window.api.saveNote(note);

    if (shouldInvalidate) {
      void queryClient.invalidateQueries({ queryKey: ["notes"] });
      void queryClient.invalidateQueries({ queryKey: ["tags"] });
      void queryClient.invalidateQueries({ queryKey: ["noteTags", note._id] });
    }
  });
}

export function useSaveNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      note,
      editor,
      transformers,
      shouldInvalidate = false,
    }: {
      note: Note | undefined | null;
      editor: LexicalEditor | EditorState;
      transformers: Transformer[];
      shouldInvalidate?: boolean;
    }) => saveNote(note, editor, transformers, queryClient, shouldInvalidate),
  });
}

"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.useSaveNote = useSaveNote;
const markdown_1 = require("@lexical/markdown");
const react_query_1 = require("@tanstack/react-query");
const markdown_2 = require("~/lib/markdown");
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
function saveNote(note, editor, transformers, queryClient, shouldInvalidate) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!note) {
            console.error("No active note found");
            return;
        }
        yield editor.read(() => __awaiter(this, void 0, void 0, function* () {
            console.log("saving note", note);
            const markdownText = (0, markdown_1.$convertToMarkdownString)(transformers);
            const noteToUpdate = yield window.api.getNote(note._id);
            if ((noteToUpdate === null || noteToUpdate === void 0 ? void 0 : noteToUpdate.content) === markdownText) {
                return;
            }
            note.content = markdownText;
            note.title = (0, markdown_2.parseTitle)(markdownText);
            yield window.api.saveNote(note);
            if (shouldInvalidate) {
                void queryClient.invalidateQueries({ queryKey: ["notes"] });
                void queryClient.invalidateQueries({ queryKey: ["tags"] });
                void queryClient.invalidateQueries({ queryKey: ["noteTags", note._id] });
            }
        }));
    });
}
function useSaveNote() {
    const queryClient = (0, react_query_1.useQueryClient)();
    return (0, react_query_1.useMutation)({
        mutationFn: ({ note, editor, transformers, shouldInvalidate = false, }) => saveNote(note, editor, transformers, queryClient, shouldInvalidate),
    });
}
//# sourceMappingURL=useSaveNote.js.map
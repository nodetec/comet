"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useEvents = void 0;
const react_1 = require("react");
const react_query_1 = require("@tanstack/react-query");
const store_1 = require("~/store");
const useEvents = () => {
    const activeNoteId = (0, store_1.useAppState)((state) => state.activeNoteId);
    const setActiveNoteId = (0, store_1.useAppState)((state) => state.setActiveNoteId);
    const activeNotebookId = (0, store_1.useAppState)((state) => state.activeNotebookId);
    const activeNotebookName = (0, store_1.useAppState)((state) => state.activeNotebookName);
    const setActiveNotebookId = (0, store_1.useAppState)((state) => state.setActiveNotebookId);
    const setActiveNotebookName = (0, store_1.useAppState)((state) => state.setActiveNotebookName);
    const feedType = (0, store_1.useAppState)((state) => state.feedType);
    const setFeedType = (0, store_1.useAppState)((state) => state.setFeedType);
    const queryClient = (0, react_query_1.useQueryClient)();
    (0, react_1.useEffect)(() => {
        const noteMovedToTrashHandler = (event, noteId) => {
            if (activeNoteId === noteId) {
                setActiveNoteId(undefined);
            }
            console.log("Note moved to trash:", noteId);
            void queryClient.invalidateQueries({ queryKey: ["notes"] });
        };
        const cleanup = window.api.onNoteMovedToTrash(noteMovedToTrashHandler);
        return cleanup;
    }, [activeNoteId, queryClient, setActiveNoteId]);
    (0, react_1.useEffect)(() => {
        const noteDeletedHandler = (event, noteId) => {
            if (activeNoteId === noteId) {
                setActiveNoteId(undefined);
            }
            console.log("Note deleted:", noteId);
            void queryClient.invalidateQueries({ queryKey: ["notes"] });
        };
        const cleanup = window.api.onNoteDeleted(noteDeletedHandler);
        return cleanup;
    }, [activeNoteId, queryClient, setActiveNoteId]);
    (0, react_1.useEffect)(() => {
        const noteRestoredHandler = (event, noteId) => {
            console.log("Note restored:", noteId);
            void queryClient.invalidateQueries({ queryKey: ["notes"] });
        };
        const cleanup = window.api.onNoteRestored(noteRestoredHandler);
        return cleanup;
    }, [queryClient]);
    (0, react_1.useEffect)(() => {
        const notebookHiddenHandler = (event, notebookId) => {
            if (activeNotebookId === notebookId) {
                setActiveNotebookId("all");
                setActiveNotebookName("all");
                setFeedType("all");
            }
            void queryClient.invalidateQueries({ queryKey: ["notebooks"] });
        };
        const cleanup = window.api.onNotebookHidden(notebookHiddenHandler);
        return cleanup;
    }, [
        queryClient,
        activeNotebookId,
        activeNotebookName,
        setFeedType,
        setActiveNotebookId,
        setActiveNotebookName,
    ]);
    (0, react_1.useEffect)(() => {
        const notebookDeletedHandler = (event, notebookId) => {
            if (activeNotebookId === notebookId) {
                setActiveNotebookId("all");
                setActiveNotebookName("all");
                setFeedType("all");
            }
            void queryClient.invalidateQueries({ queryKey: ["notebooks"] });
        };
        const cleanup = window.api.onNotebookDeleted(notebookDeletedHandler);
        return cleanup;
    }, [
        queryClient,
        activeNotebookId,
        activeNotebookName,
        setActiveNotebookId,
        setActiveNotebookName,
        setFeedType,
    ]);
    (0, react_1.useEffect)(() => {
        const noteMovedToNotebookHandler = (event, noteId) => {
            console.log("Note moved to notebook:", noteId);
            void queryClient.invalidateQueries({ queryKey: ["notes"] });
        };
        const cleanup = window.api.onNoteMovedToNotebook(noteMovedToNotebookHandler);
        return cleanup;
    }, [queryClient]);
};
exports.useEvents = useEvents;
//# sourceMappingURL=useEvents.js.map
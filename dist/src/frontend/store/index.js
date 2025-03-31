"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useAppState = void 0;
const zustand_1 = require("zustand");
const middleware_1 = require("zustand/middleware");
exports.useAppState = (0, zustand_1.create)()((0, middleware_1.persist)((set) => ({
    activeNoteId: undefined,
    setActiveNoteId: (activeNoteId) => set({ activeNoteId }),
    keys: undefined,
    setKeys: (keys) => set({ keys }),
    relays: [{ url: "wss://relay.damus.io", read: true, write: true }],
    setRelays: (relays) => set({ relays }),
    activeNotebookId: undefined,
    setActiveNotebookId: (activeNotebookId) => set({ activeNotebookId }),
    activeNotebookName: undefined,
    setActiveNotebookName: (activeNotebookName) => set({ activeNotebookName }),
    activeTags: [],
    setActiveTags: (activeTags) => set({ activeTags }),
    lastTagVisible: false,
    setLastTagVisible: (lastTagVisible) => set({ lastTagVisible }),
    feedType: "all",
    setFeedType: (feedType) => set({ feedType }),
    appFocus: undefined,
    setAppFocus: (appFocus) => set({ appFocus }),
    settingsTab: "profile",
    setSettingsTab: (settingsTab) => set({ settingsTab }),
    syncRadio: "nosync",
    setSyncRadio: (syncRadio) => set({ syncRadio }),
    noteSearch: "",
    setNoteSearch: (noteSearch) => set({ noteSearch }),
}), {
    name: "comet-storage",
    storage: (0, middleware_1.createJSONStorage)(() => localStorage),
    partialize: (state) => ({
        feedType: state.feedType,
        activeNoteId: state.activeNoteId,
        activeNotebookId: state.activeNotebookId,
        activeNotebookName: state.activeNotebookName,
        activeTags: state.activeTags,
        settingsTab: state.settingsTab,
        syncRadio: state.syncRadio,
        keys: state.keys,
    }),
}));
//# sourceMappingURL=index.js.map
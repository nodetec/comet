"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.trackChanges = trackChanges;
function trackChanges(db) {
    void db
        .changes({
        since: "now",
        live: true,
        include_docs: true,
    })
        .on("change", (change) => {
        console.log("change", change);
    });
}
//# sourceMappingURL=trackChanges.js.map
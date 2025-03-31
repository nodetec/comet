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
exports.setupDesignDoc = setupDesignDoc;
const designDoc = {
    _id: "_design/tags",
    views: {
        allTags: {
            map: `function(doc) {
        if (doc.type === "note" && doc.tags && Array.isArray(doc.tags)) {
          doc.tags.forEach(function(tag) {
            emit(tag, null);
          });
        }
      }`,
            reduce: "_count",
        },
        tagsByNotebook: {
            map: `function(doc) {
        if (doc.type === "note" && doc.notebookId && doc.tags && Array.isArray(doc.tags)) {
          doc.tags.forEach(function(tag) {
            emit([doc.notebookId, tag], null);
          });
        }
      }`,
            reduce: "_count",
        },
    },
};
function setupDesignDoc(db) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            yield db.put(designDoc);
            console.log("Design document created.");
        }
        catch (err) {
            // TODO: fix this type
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-expect-error
            if (err.status !== 409) {
                // Ignore if it already exists
                console.error("Error creating design document:", err);
                throw err;
            }
        }
    });
}
//# sourceMappingURL=tagsDesignDoc.js.map
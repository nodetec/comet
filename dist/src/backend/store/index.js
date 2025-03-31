"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStore = exports.initStore = void 0;
const electron_store_1 = __importDefault(require("electron-store"));
// TODO: Add schema
let store;
const initStore = () => {
    store = new electron_store_1.default({
        encryptionKey: "12345",
        clearInvalidConfig: true,
    });
};
exports.initStore = initStore;
const getStore = () => {
    return store;
};
exports.getStore = getStore;
//# sourceMappingURL=index.js.map
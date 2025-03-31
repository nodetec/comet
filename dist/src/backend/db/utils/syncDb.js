"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sync = sync;
const parseCouchDbUrl_1 = require("&/api/utils/parseCouchDbUrl");
const window_1 = require("&/window");
const pouchdb_1 = __importDefault(require("pouchdb"));
const __1 = require("..");
function sync(remoteUrl) {
    const db = (0, __1.getDb)();
    const mainWindow = (0, window_1.getWindow)();
    let dbUrl = remoteUrl;
    let dbUsername = "";
    let dbPassword = "";
    // If remoteUrl contains authentication info, parse it
    if (remoteUrl.includes("@")) {
        const parsed = (0, parseCouchDbUrl_1.parseCouchDbUrl)(remoteUrl);
        dbUrl = parsed.url;
        dbUsername = parsed.username;
        dbPassword = parsed.password;
    }
    const remoteDB = new pouchdb_1.default(dbUrl, {
        auth: {
            username: dbUsername,
            password: dbPassword,
        },
    });
    //   console.log("remoteDB", remoteDB);
    //   console.log("db", db);
    //   console.log("mainWindow", mainWindow);
    //   console.log("dbUrl", dbUrl);
    //   console.log("dbUsername", dbUsername);
    //   console.log("dbPassword", dbPassword);
    const sync = db
        .sync(remoteDB, {
        live: true,
        retry: true,
    })
        .on("change", function (change) {
        console.log("sync change", change);
        if (change.direction === "pull") {
            console.log("pull change", change);
            mainWindow.webContents.send("sync", change);
        }
    })
        .on("error", function (err) {
        console.error("sync error", err);
    });
    console.log("sync", sync);
    (0, __1.setSync)(sync);
}
//# sourceMappingURL=syncDb.js.map
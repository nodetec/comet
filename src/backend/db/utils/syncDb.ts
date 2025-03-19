import { parseCouchDbUrl } from "&/api/utils/parseCouchDbUrl";
import { getWindow } from "&/window";
import PouchDB from "pouchdb";

import { getDb, setSync } from "..";

export function sync(remoteUrl: string) {
  const db = getDb();
  const mainWindow = getWindow();
  let dbUrl = remoteUrl;
  let dbUsername = "";
  let dbPassword = "";

  // If remoteUrl contains authentication info, parse it
  if (remoteUrl.includes("@")) {
    const parsed = parseCouchDbUrl(remoteUrl);
    dbUrl = parsed.url;
    dbUsername = parsed.username;
    dbPassword = parsed.password;
  }

  const remoteDB = new PouchDB(dbUrl, {
    auth: {
      username: dbUsername,
      password: dbPassword,
    },
  });

  console.log("remoteDB", remoteDB);
  console.log("db", db);
  console.log("mainWindow", mainWindow);
  console.log("dbUrl", dbUrl);
  console.log("dbUsername", dbUsername);
  console.log("dbPassword", dbPassword);

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

  setSync(sync);
}

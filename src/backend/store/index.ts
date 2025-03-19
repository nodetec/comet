import Store from "electron-store";

// TODO: Add schema
let store: Store;

export const initStore = () => {
  store = new Store({
    encryptionKey: "12345",
    clearInvalidConfig: true,
  });
};

export const getStore = () => {
  return store;
};

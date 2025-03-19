import Store from "electron-store";

// TODO: Add schema
let store: Store;

export const initStore = () => {
  store = new Store();
};

export const getStore = () => {
  return store;
};

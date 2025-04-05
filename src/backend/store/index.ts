import Store from "electron-store";

interface SyncConfig {
  remote: {
    url: string | undefined;
  };
  method: "custom_sync" | "no_sync";
}

interface StoreSchema {
  sync: SyncConfig;
  sortBy: "createdAt" | "editedAt" | "title";
  createdAtSortOrder: "asc" | "desc";
  editedAtSortOrder: "asc" | "desc";
  titleSortOrder: "asc" | "desc";
}

let store: Store<StoreSchema>;

export const initStore = () => {
  store = new Store<StoreSchema>({
    encryptionKey: "12345",
    clearInvalidConfig: true,
    schema: {
      sync: {
        type: "object",
        properties: {
          remote: {
            type: "object",
            properties: {
              url: {
                type: ["string", "null"],
              },
            },
          },
          method: {
            type: "string",
            enum: ["custom_sync", "no_sync"],
            default: "no_sync",
          },
        },
        required: ["remote", "method"],
        default: {
          remote: {
            url: undefined,
          },
          method: "no_sync",
        },
      },
      sortBy: {
        type: "string",
        enum: ["createdAt", "editedAt", "title"],
        default: "editedAt",
      },
      createdAtSortOrder: {
        type: "string",
        enum: ["asc", "desc"],
        default: "desc",
      },
      editedAtSortOrder: {
        type: "string",
        enum: ["asc", "desc"],
        default: "desc",
      },
      titleSortOrder: {
        type: "string",
        enum: ["asc", "desc"],
        default: "asc",
      },
    },
  });
};

export const getStore = () => {
  return store;
};

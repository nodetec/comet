export type Notebook = {
  _id: string;
  _rev: string | undefined;
  type: "notebook";
  name: string;
  sortBy: "createdAt" | "editedAt" | "title";
  createdAtSortOrder: "asc" | "desc";
  editedAtSortOrder: "asc" | "desc";
  titleSortOrder: "asc" | "desc";
  color: string;
  hidden: boolean;
  createdAt: string;
  updatedAt: string;
  pinnedAt: string | undefined;
  defaultLanguage: string | undefined;
};

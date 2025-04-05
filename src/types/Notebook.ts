export type Notebook = {
  _id: string;
  _rev: string | undefined;
  type: "notebook";
  name: string;
  sortBy: "createdAt" | "contentUpdatedAt" | "title";
  createdAtSortOrder: "asc" | "desc";
  contentUpdatedAtSortOrder: "asc" | "desc";
  titleSortOrder: "asc" | "desc";
  color: string;
  hidden: boolean;
  createdAt: string;
  updatedAt: string;
  pinnedAt: string | undefined;
};

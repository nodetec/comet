export type Notebook = {
  _id: string;
  _rev: string | undefined;
  type: "notebook";
  name: string;
  sortBy: "createdAt" | "contentUpdatedAt" | "title";
  sortOrder: "asc" | "desc";
  color: string;
  hidden: boolean;
  createdAt: string;
  updatedAt: string;
  pinnedAt: string | undefined;
};

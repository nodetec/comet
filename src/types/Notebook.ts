export type Notebook = {
  _id: string;
  _rev: string | undefined;
  type: "notebook";
  name: string;
  hidden: boolean;
  createdAt: string;
  updatedAt: string;
  pinnedAt: string | undefined;
};

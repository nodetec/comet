export type Notebook = {
  _id: string;
  _rev: string | undefined;
  type: "notebook";
  name: string;
  hidden: boolean;
  createdAt: Date;
  updatedAt: Date;
  pinnedAt: Date | undefined;
};

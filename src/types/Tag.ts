export type Tag = {
  _id: string;
  _rev: string | undefined;
  type: "note";
  name: string;
  color?: string;
  icon?: string;
  createdAt: Date;
  updatedAt: Date;
};

type Page<T> = {
  data: T[] | undefined;
  nextPage: number | undefined;
  nextCursor: number | undefined;
  prevCursor: number | undefined;
};

export type InfiniteQueryData<T> = {
  pageParams: number[];
  pages: Page<T>[] | undefined;
};

import { useQueryClient } from "@tanstack/react-query";

export const useGetCachedQueryData = (key: string) => {
  const queryClient = useQueryClient();
  const data = queryClient.getQueryData([key, { search: false }]);
  return data;
};

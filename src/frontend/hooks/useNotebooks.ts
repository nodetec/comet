import { useQuery, type QueryFunctionContext } from "@tanstack/react-query";

type QueryKey = [string, boolean];

async function fetchNotebooks({ queryKey }: QueryFunctionContext<QueryKey>) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_, showHidden] = queryKey;

  try {
    return await window.api.getNotebooks(showHidden);
  } catch (e) {
    console.error("Error fetching notebooks:", e);
    return null;
  }
}

export const useNotebooks = (showHidden: boolean) => {
  return useQuery({
    queryKey: ["notebooks", showHidden],
    refetchOnWindowFocus: false,
    queryFn: fetchNotebooks,
  });
};

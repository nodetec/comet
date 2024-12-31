import { useQuery, type QueryFunctionContext } from "@tanstack/react-query";
import { AppService } from "&/comet/backend/service";

type QueryKey = [string, boolean];

async function fetchNotebooks({ queryKey }: QueryFunctionContext<QueryKey>) {
  const [_, pinned] = queryKey;
  try {
    const tags = await AppService.GetNotebooks(pinned);
    return tags;
  } catch (e) {
    console.error("Error fetching notebooks:", e);
    return null;
  }
}

export const useNotebooks = (pinned: boolean) => {
  return useQuery({
    queryKey: ["notebooks", pinned],
    refetchOnWindowFocus: false,
    refetchOnMount: true,
    queryFn: fetchNotebooks,
  });
};

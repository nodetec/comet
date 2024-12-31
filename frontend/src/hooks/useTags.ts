import { useQuery } from "@tanstack/react-query";
import { AppService } from "&/comet/backend/service";

async function fetchTags() {
  console.log("Fetching tags");
  try {
    const tags = await AppService.GetTags();
    console.log("Tags:", tags);
    return tags;
  } catch (e) {
    console.error("Error fetching active user:", e);
    return null;
  }
}

export const useTags = () => {
  return useQuery({
    queryKey: ["tags"],
    refetchOnWindowFocus: false,
    refetchOnMount: true,
    queryFn: fetchTags,
  });
};

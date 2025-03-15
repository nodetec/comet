import { useQuery } from "@tanstack/react-query";

async function fetchTags(notebookId?: string) {
  try {
    if (notebookId) {
      return (await window.api.getTagsByNotebookId(notebookId)) ?? [];
    }

    return (await window.api.getAllTags()) ?? [];
  } catch (e) {
    console.error("Error fetching tags:", e);
    return [];
  }
}

export const useTags = (notebookId?: string) => {
  return useQuery({
    queryKey: ["tags", notebookId],
    refetchOnWindowFocus: false,
    queryFn: () => fetchTags(notebookId),
  });
};

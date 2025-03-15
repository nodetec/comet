import { useQuery } from "@tanstack/react-query";

async function fetchTags() {
  try {
    return (await window.api.getAllTags()) ?? [];
  } catch (e) {
    console.error("Error fetching tags:", e);
    return [];
  }
}

export const useTags = () => {
  return useQuery({
    queryKey: ["tags"],
    refetchOnWindowFocus: false,
    queryFn: fetchTags,
  });
};

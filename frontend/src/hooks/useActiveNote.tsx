import { useQuery } from "@tanstack/react-query";
import { AppService } from "&/comet/backend/service";

async function fetchActiveNote() {
  console.log("Fetching active note");
  try {
    const activeNote = await AppService.GetActiveNote();
    return activeNote;
  } catch (e) {
    console.error("Error fetching active note:", e);
    return null;
  }
}

export const useActiveNote = () => {
  return useQuery({
    queryKey: ["activeNote"],
    refetchOnWindowFocus: false,
    refetchOnMount: true,
    queryFn: fetchActiveNote,
  });
};

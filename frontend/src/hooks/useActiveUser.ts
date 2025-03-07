import { useQuery } from "@tanstack/react-query";
import { type User } from "&/comet/backend/models/models";
import { AppService } from "&/comet/backend/service";

async function fetchActiveUser() {
  console.log("Fetching active user");
  try {
    const activeUser = (await AppService.GetActiveUser()) as User;
    return activeUser;
  } catch (e) {
    console.error("Error fetching active user:", e);
    return null;
  }
}

export const useActiveUser = () => {
  return useQuery({
    queryKey: ["activeUser"],
    refetchOnWindowFocus: false,
    refetchOnMount: true,
    queryFn: fetchActiveUser,
  });
};

import { useAppState } from "~/store";

import NoteFeed from "./NoteFeed";
import NoteFeedHeader from "./NoteFeedHeader";
import SearchNotes from "./SearchNotes";
import TrashFeed from "./TrashFeed";
import SearchFeed from "./SearchFeed";
import TrashSearchFeed from "./TrashSearchFeed";

export default function Notes() {
  const feedType = useAppState((state) => state.feedType);
  const searchActive = useAppState((state) => state.searchActive);

  return (
      <div className="h-full flex flex-col">
      <NoteFeedHeader feedType={feedType} />
      <SearchNotes />
      {(searchActive && feedType !== "trash") && <SearchFeed />}
      {(searchActive && feedType === "trash") && <TrashSearchFeed />}
      {(feedType === "all" || feedType === "notebook") &&
        !searchActive && <NoteFeed />}
      {feedType === "trash" && !searchActive && <TrashFeed />}
    </div>
  );
}

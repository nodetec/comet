import { useAppState } from "~/store";

import NoteFeed from "./NoteFeed";
import NoteFeedHeader from "./NoteFeedHeader";
import SearchNotes from "./SearchNotes";
import TrashFeed from "./TrashFeed";
import SearchFeed from "./SearchFeed";
import TrashSearchFeed from "./TrashSearchFeed";

export default function Notes() {
  const { feedType, searchActive } = useAppState();

  return (
    <div className="flex h-full flex-col">
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

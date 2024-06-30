import { useAppState } from "~/store";

import NoteFeed from "./NoteFeed";
import NoteFeedHeader from "./NoteFeedHeader";
import SearchNotes from "./SearchNotes";
import TagFeed from "./TagFeed";

export default function Notes() {
  const { feedType } = useAppState();

  return (
    <div className="flex h-full flex-col">
      <NoteFeedHeader feedType={feedType} />
      <SearchNotes />
      {feedType === "all" && <NoteFeed />}
      {feedType === "tag" && <TagFeed />}
    </div>
  );
}

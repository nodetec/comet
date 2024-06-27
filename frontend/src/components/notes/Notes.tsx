import NoteFeed from "./NoteFeed";
import NoteFeedHeader from "./NoteFeedHeader";
import SearchNotes from "./SearchNotes";

export default function Notes() {
  return (
    <div className="h-full flex flex-col">
      <NoteFeedHeader />
      <SearchNotes />
      <NoteFeed />
    </div>
  );
}

import NoteFeed from "./NoteFeed";
import NoteFeedHeader from "./NoteFeedHeader";
import SearchNotes from "./SearchNotes";

export default function Notes() {
  return (
    <div className="border border-blue-300 h-full flex flex-col">
      <NoteFeedHeader />
      <SearchNotes />
      <NoteFeed />
    </div>
  );
}

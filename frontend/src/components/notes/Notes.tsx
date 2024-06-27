import NoteFeed from "./NoteFeed";
import NoteFeedHeader from "./NoteFeedHeader";
import SearchNotes from "./SearchNotes";

export default function Notes() {
  return (
    <div className="h-full overflow-y-auto border-4 border-blue-500">
      {/* <NoteFeedHeader /> */}
      {/* <SearchNotes /> */}
      <NoteFeed />
    </div>
  );
}

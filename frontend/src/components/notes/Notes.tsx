import NoteFeed from "./NoteFeed";
import NoteFeedHeader from "./NoteFeedHeader";
import SearchNotes from "./SearchNotes";

export default function Notes() {
  return (
    <>
      <NoteFeedHeader />
      <SearchNotes />
      <NoteFeed />
    </>
  );
}

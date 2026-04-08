import { type WikiLinkResolutionInput } from "@/shared/api/types";

export function haveSameWikilinkResolutions(
  left: WikiLinkResolutionInput[],
  right: WikiLinkResolutionInput[],
): boolean {
  if (left.length !== right.length) return false;
  const sortByLocation = (
    a: WikiLinkResolutionInput,
    b: WikiLinkResolutionInput,
  ) => a.location - b.location;
  // eslint-disable-next-line unicorn/no-array-sort -- app runtime compatibility still excludes toSorted here
  const sortedLeft = [...left].sort(sortByLocation);
  // eslint-disable-next-line unicorn/no-array-sort -- app runtime compatibility still excludes toSorted here
  const sortedRight = [...right].sort(sortByLocation);
  return sortedLeft.every((resolution, index) => {
    const candidate = sortedRight[index];
    return (
      candidate?.occurrenceId === resolution.occurrenceId &&
      candidate?.location === resolution.location &&
      candidate?.targetNoteId === resolution.targetNoteId &&
      candidate?.title === resolution.title
    );
  });
}

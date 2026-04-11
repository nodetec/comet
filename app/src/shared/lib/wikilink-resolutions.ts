import { type WikiLinkResolutionInput } from "@/shared/api/types";

const sortByLocation = (
  a: WikiLinkResolutionInput,
  b: WikiLinkResolutionInput,
) => a.location - b.location;

export function haveSameWikilinkResolutions(
  left: WikiLinkResolutionInput[],
  right: WikiLinkResolutionInput[],
): boolean {
  if (left.length !== right.length) return false;
  const sortedLeft = left.toSorted(sortByLocation);
  const sortedRight = right.toSorted(sortByLocation);
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

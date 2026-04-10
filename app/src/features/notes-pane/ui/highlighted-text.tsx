import { Fragment, memo } from "react";

import {
  HIGHLIGHT_CLASS_NAME,
  MAX_HIGHLIGHT_MATCHES_PER_BLOCK,
  findNextHighlightMatch,
} from "@/features/notes-pane/ui/notes-pane-utils";

export const HighlightedText = memo(function HighlightedText({
  text,
  highlightWords,
}: {
  text: string;
  highlightWords: string[];
}) {
  if (highlightWords.length === 0 || text.length === 0) {
    return <>{text}</>;
  }

  const lowerText = text.toLocaleLowerCase();
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  let key = 0;
  let matchCount = 0;

  while (cursor < text.length) {
    const match = findNextHighlightMatch(lowerText, cursor, highlightWords);
    if (match.index === -1) break;

    if (match.index > cursor) {
      parts.push(
        <Fragment key={`text-${key++}`}>
          {text.slice(cursor, match.index)}
        </Fragment>,
      );
    }

    const end = match.index + match.length;
    parts.push(
      <mark className={HIGHLIGHT_CLASS_NAME} key={`mark-${key++}`}>
        {text.slice(match.index, end)}
      </mark>,
    );
    cursor = end;
    matchCount += 1;

    if (matchCount >= MAX_HIGHLIGHT_MATCHES_PER_BLOCK) break;
  }

  if (parts.length === 0) return <>{text}</>;
  if (cursor < text.length) {
    parts.push(<Fragment key={`text-${key++}`}>{text.slice(cursor)}</Fragment>);
  }
  return <>{parts}</>;
});

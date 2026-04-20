import { type RefObject } from "react";
import { ChevronDown, ChevronUp, Search, X } from "lucide-react";

import { Button } from "@/shared/ui/button";

export function EditorFindBar({
  findQuery,
  findMatchCount,
  activeFindMatchIndex,
  findInputRef,
  onQueryChange,
  onResetMatchIndex,
  onFocus,
  onStepMatch,
  onClose,
  onClear,
}: {
  findQuery: string;
  findMatchCount: number;
  activeFindMatchIndex: number;
  findInputRef: RefObject<HTMLInputElement | null>;
  onQueryChange: (query: string) => void;
  onResetMatchIndex: () => void;
  onFocus: () => void;
  onStepMatch: (direction: 1 | -1) => void;
  onClose: (focusEditor: boolean) => void;
  onClear: () => void;
}) {
  return (
    <div className="border-separator flex shrink-0 items-center gap-2 border-b px-3 pb-4">
      <label className="border-input/60 focus-within:border-primary relative flex min-w-0 flex-1 items-center gap-2 rounded-md border px-3 py-1">
        <Search className="text-muted-foreground size-3.5 shrink-0" />
        <input
          autoCapitalize="off"
          ref={findInputRef}
          className="placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent text-sm outline-none"
          placeholder="Search…"
          value={findQuery}
          onChange={(e) => {
            onQueryChange(e.target.value);
            onResetMatchIndex();
          }}
          onFocus={onFocus}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onStepMatch(e.shiftKey ? -1 : 1);
              return;
            }

            if (e.key === "Escape") {
              e.preventDefault();
              onClose(true);
            }
          }}
        />
        <span className="text-muted-foreground min-w-12 text-right text-xs tabular-nums">
          {findQuery &&
            findMatchCount > 0 &&
            `${activeFindMatchIndex + 1}/${findMatchCount}`}
          {findQuery && findMatchCount === 0 && "0"}
        </span>
      </label>
      <Button
        className="text-muted-foreground"
        disabled={findMatchCount === 0}
        onClick={() => onStepMatch(-1)}
        onMouseDown={(event) => event.preventDefault()}
        size="icon-xs"
        variant="ghost"
      >
        <ChevronUp className="size-3.5" />
      </Button>
      <Button
        className="text-muted-foreground"
        disabled={findMatchCount === 0}
        onClick={() => onStepMatch(1)}
        onMouseDown={(event) => event.preventDefault()}
        size="icon-xs"
        variant="ghost"
      >
        <ChevronDown className="size-3.5" />
      </Button>
      <Button
        className="text-muted-foreground"
        onClick={() => {
          if (findQuery) {
            onClear();
          } else {
            onClose(false);
          }
        }}
        onMouseDown={(event) => event.preventDefault()}
        size="icon-xs"
        variant="ghost"
      >
        <X className="size-3.5" />
      </Button>
    </div>
  );
}

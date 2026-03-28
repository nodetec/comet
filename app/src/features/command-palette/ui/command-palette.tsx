import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Command as CommandPrimitive } from "cmdk";
import { Archive, FileText, Hash, Search } from "lucide-react";

import {
  DialogBackdrop,
  DialogPopup,
  DialogPortal,
  DialogRoot,
} from "@/shared/ui/dialog";
import { cn } from "@/shared/lib/utils";

type SearchResult = {
  id: string;
  title: string;
  preview: string;
  archivedAt: number | null;
};

type SearchMode = "notes" | "tags";

type CommandPaletteProps = {
  availableTagPaths: string[];
  open: boolean;
  onOpenChange(open: boolean): void;
  onSelectNote(noteId: string): void;
  onSelectTagPath(tagPath: string): void;
};

function useDebouncedSearch(
  searchTerm: string,
  mode: SearchMode,
  debounceRef: React.RefObject<number | null>,
  setNoteResults: (results: SearchResult[]) => void,
  setTagResults: (results: string[]) => void,
  setSearching: (searching: boolean) => void,
) {
  useEffect(() => {
    if (debounceRef.current !== null) {
      clearTimeout(debounceRef.current);
    }

    if (!searchTerm) {
      setNoteResults([]);
      setTagResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    debounceRef.current = window.setTimeout(() => {
      if (mode === "tags") {
        invoke<string[]>("search_tags", { query: searchTerm })
          .then(setTagResults)
          .catch(() => setTagResults([]))
          .finally(() => setSearching(false));
      } else {
        invoke<SearchResult[]>("search_notes", { query: searchTerm })
          .then(setNoteResults)
          .catch(() => setNoteResults([]))
          .finally(() => setSearching(false));
      }
    }, 150);

    return () => {
      if (debounceRef.current !== null) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [searchTerm, mode]); // eslint-disable-line react-hooks/exhaustive-deps
}

export function CommandPalette({
  availableTagPaths,
  open,
  onOpenChange,
  onSelectNote,
  onSelectTagPath,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [noteResults, setNoteResults] = useState<SearchResult[]>([]);
  const [tagResults, setTagResults] = useState<string[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<number | null>(null);

  const mode: SearchMode = query.startsWith("#") ? "tags" : "notes";

  const searchTerm =
    mode === "notes" ? query.trim() : query.trim().slice(1).trim();

  const displayedTags =
    mode === "tags" && !searchTerm ? availableTagPaths : tagResults;

  const hasResults =
    mode === "tags" ? displayedTags.length > 0 : noteResults.length > 0;

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setQuery("");
      setNoteResults([]);
      setTagResults([]);
      setSearching(false);
    }
  }, [open]);

  // Debounced search for notes and tags
  useDebouncedSearch(
    searchTerm,
    mode,
    debounceRef,
    setNoteResults,
    setTagResults,
    setSearching,
  );

  const handleSelectNote = (noteId: string) => {
    onSelectNote(noteId);
    onOpenChange(false);
  };

  const handleSelectTag = (tagPath: string) => {
    onSelectTagPath(tagPath);
    onOpenChange(false);
  };

  const showList =
    mode === "tags"
      ? displayedTags.length > 0 || (!!searchTerm && !searching)
      : !!searchTerm && !(searching && !hasResults);

  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogBackdrop />
        <DialogPopup className="fixed top-[20%] left-1/2 w-full max-w-lg -translate-x-1/2 translate-y-0 overflow-hidden p-0">
          <CommandPrimitive className="flex flex-col" shouldFilter={false} loop>
            <div className="flex items-center px-3">
              <Search className="text-muted-foreground mr-2 size-4 shrink-0" />
              <CommandPrimitive.Input
                className="placeholder:text-muted-foreground flex h-12 w-full bg-transparent py-3 text-lg outline-none"
                placeholder="Search notes or #tags"
                value={query}
                onValueChange={setQuery}
              />
            </div>
            <CommandPrimitive.List
              className={cn(
                "max-h-72 overflow-y-auto overscroll-contain p-1",
                !showList && "hidden",
              )}
            >
              {searchTerm && !searching && !hasResults && (
                <CommandPrimitive.Empty className="text-muted-foreground py-6 text-center text-sm">
                  {mode === "tags" && "No tags found."}
                  {mode === "notes" && "No notes found."}
                </CommandPrimitive.Empty>
              )}

              {mode === "tags" &&
                displayedTags.map((tag) => (
                  <CommandPrimitive.Item
                    key={tag}
                    value={tag}
                    onSelect={() => handleSelectTag(tag)}
                    className="data-[selected=true]:bg-accent flex cursor-default items-center gap-3 rounded-md px-2 py-2 text-sm outline-none select-none"
                  >
                    <Hash className="text-muted-foreground size-4 shrink-0" />
                    <span className="truncate">{tag}</span>
                  </CommandPrimitive.Item>
                ))}

              {mode === "notes" &&
                noteResults.map((result) => (
                  <CommandPrimitive.Item
                    key={result.id}
                    value={result.id}
                    onSelect={() => handleSelectNote(result.id)}
                    className="data-[selected=true]:bg-accent flex cursor-default items-start gap-3 rounded-md px-2 py-2 text-sm outline-none select-none"
                  >
                    <div className="mt-0.5 shrink-0">
                      {result.archivedAt ? (
                        <Archive className="text-muted-foreground size-4" />
                      ) : (
                        <FileText className="text-muted-foreground size-4" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div
                        className={cn(
                          "truncate font-medium",
                          result.archivedAt && "text-muted-foreground",
                        )}
                      >
                        {result.title || "Untitled"}
                      </div>
                      {result.preview && (
                        <div className="text-muted-foreground mt-0.5 truncate text-xs">
                          {result.preview}
                        </div>
                      )}
                    </div>
                  </CommandPrimitive.Item>
                ))}
            </CommandPrimitive.List>
          </CommandPrimitive>
        </DialogPopup>
      </DialogPortal>
    </DialogRoot>
  );
}

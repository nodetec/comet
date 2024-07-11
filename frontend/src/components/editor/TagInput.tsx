import { useState } from "react";

import { CaretSortIcon } from "@radix-ui/react-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { NullString } from "&/database/sql/models";
import { Note } from "&/github.com/nodetec/captains-log/db/models";
import {
  NotebookService,
  NoteTagService,
  Tag,
  TagService,
} from "&/github.com/nodetec/captains-log/service";
import { Button } from "~/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "~/components/ui/command";
import { Input } from "~/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import { useAppState } from "~/store";

import NoteTag from "./NoteTag";

type Props = {
  note: Note;
  tags: Tag[];
};

export default function TagInput({ note, tags }: Props) {
  const { activeNote } = useAppState();

  const [loading, setLoading] = useState(false);
  const [tagName, setTagName] = useState<string>("");
  const [openTagInputCombobox, setOpenTagInputCombobox] = useState(false);

  const queryClient = useQueryClient();

  const handleTagChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTagName = e.target.value;
    setTagName(newTagName);
  };

  const isTagAssociatedWithNote = async (tag: Tag) => {
    const isTagAssociated = await NoteTagService.CheckTagForNote(
      note.ID,
      tag.ID,
    );

    if (!isTagAssociated) {
      await NoteTagService.AddTagToNote(note.ID, tag.ID);
      void queryClient.invalidateQueries({ queryKey: ["note_tags"] });
      setTagName("");
    }
  };

  const isTagAssociatedWithNotebook = async (tag: Tag) => {
    let isTagAssociatedWithNotebook = false;
    if (activeNote?.NotebookID && activeNote?.NotebookID !== 0) {
      isTagAssociatedWithNotebook = await NotebookService.CheckTagForNotebook(
        activeNote.NotebookID,
        tag.ID,
      );

      if (!isTagAssociatedWithNotebook) {
        await NotebookService.AddTagToNotebook(activeNote.NotebookID, tag.ID);
        void queryClient.invalidateQueries({ queryKey: ["tags"] });
      }
    }
  };

  const handleKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      // check if tag already exists
      let noteTag: Tag | undefined;
      try {
        noteTag = await TagService.GetTagByName(tagName);
      } catch (_) {
        // if it doesn't, create it
        noteTag = await TagService.CreateTag(
          tagName,
          new NullString({ String: undefined, Valid: false }),
          new NullString({ String: undefined, Valid: false }),
          new Date().toISOString(),
        );
        void queryClient.invalidateQueries({ queryKey: ["tags"] });
      }

      isTagAssociatedWithNote(noteTag);
      isTagAssociatedWithNotebook(noteTag);
    }
  };

  // TODO
  // Handle errors
  async function handleComboboxOnSelect(tag: Tag, value: string) {
    setLoading(true);
    try {
      isTagAssociatedWithNote(tag);
      isTagAssociatedWithNotebook(tag);
      setOpenTagInputCombobox(false);
    } catch (error) {
      console.error("Tag input error: ", error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchTags() {
    const note_tags = await NoteTagService.GetTagsForNote(note.ID);
    return note_tags;
  }

  const { data } = useQuery({
    queryKey: ["note_tags", note.ID, activeNote?.NotebookID],
    staleTime: 50,
    queryFn: () => fetchTags(),
  });

  return (
    <div className="w-full border-t py-2 pl-4 pr-2">
      <div className="flex items-center gap-x-2 pr-3">
        {data?.map((tag, tagIndex) => {
          return <NoteTag key={tagIndex} note={note} tag={tag} />;
        })}

        <Input
          type="text"
          className="w-3/4 min-w-12 border-none px-1 text-xs focus-visible:ring-0"
          placeholder="Add Tags"
          onKeyDown={handleKeyDown}
          value={tagName}
          onChange={handleTagChange}
        />
        <Popover
          open={openTagInputCombobox}
          onOpenChange={setOpenTagInputCombobox}
        >
          <PopoverTrigger asChild>
            <Button
              id="editor-tag-input-combobox-btn"
              name="editor-tag-input-combobox-btn"
              variant="ghost"
              role="combobox"
              aria-expanded={openTagInputCombobox}
              className="w-1/4 justify-between pl-2 pr-0 text-xs font-normal text-muted-foreground hover:bg-transparent hover:text-muted-foreground disabled:opacity-100"
              disabled={loading}
            >
              Select tag...
              <CaretSortIcon className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align={"start"} className="p-0">
            <Command>
              <CommandInput placeholder="Search tags..." />
              <CommandList>
                <CommandEmpty>No tags found</CommandEmpty>
                <CommandGroup>
                  {tags.map((tag) => (
                    <CommandItem
                      key={tag.ID}
                      value={tag.Name}
                      onSelect={(currentValue) =>
                        handleComboboxOnSelect(tag, currentValue)
                      }
                    >
                      {tag.Name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}

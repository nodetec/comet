import { useEffect, useState } from "react";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { NullString } from "&/database/sql/models";
import { Note } from "&/github.com/nodetec/captains-log/db/models";
import {
  NotebookService,
  NoteTagService,
  Tag,
  TagService,
} from "&/github.com/nodetec/captains-log/service";
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
import { NewspaperIcon, StickyNote } from "lucide-react";

import { ScrollArea, ScrollBar } from "../ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
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
  const [comboboxTags, setComboboxTags] = useState(tags);

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
      const trimmedTagName = tagName.trim();

      // check if tag already exists
      let noteTag: Tag | undefined;
      try {
        noteTag = await TagService.GetTagByName(trimmedTagName);
      } catch (_) {
        // if it doesn't, create it
        noteTag = await TagService.CreateTag(
          trimmedTagName,
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
  // Handle errors and loading
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

  useEffect(() => {
    const dataIDs = new Set(data?.map(({ ID }) => ID));
    const comboboxTags = [...tags.filter(({ ID }) => !dataIDs.has(ID))];
    setComboboxTags(comboboxTags);
  }, [data]);

  return (
    <div className="flex min-h-12 w-full items-center border-t pr-4 pl-2">
      <div className="flex w-full items-center gap-x-2">
        <ScrollArea className="max-w-[65%] shrink-0 whitespace-nowrap">
          <div className="my-2 flex w-full gap-1.5">
            {data?.map((tag, tagIndex) => (
              <NoteTag key={tagIndex} note={note} tag={tag} />
            ))}
          </div>
          <ScrollBar
            className="-mb-0.5 cursor-pointer"
            orientation="horizontal"
          />
        </ScrollArea>

        <Popover
          open={openTagInputCombobox}
          onOpenChange={setOpenTagInputCombobox}
        >
          <PopoverTrigger asChild>
            <Input
              id="editor-tag-input-combobox-input"
              name="editor-tag-input-combobox-input"
              type="text"
              role="combobox"
              aria-expanded={openTagInputCombobox}
              placeholder="Add Tags"
              className="border border-none px-1 py-3 text-xs focus-visible:ring-0 disabled:cursor-pointer disabled:opacity-100"
              disabled={loading}
              minLength={1}
              maxLength={32}
              onKeyDown={handleKeyDown}
              value={tagName}
              onChange={handleTagChange}
            />
          </PopoverTrigger>
          <PopoverContent
            align={"start"}
            className={`mb-4 p-0 ${tags.length === 0 ? "hidden" : ""}`}
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            <Command>
              <div className="hidden">
                <CommandInput value={tagName} />
              </div>
              <CommandList>
                <CommandEmpty className="px-2 pt-1.5 text-sm">
                  No tags...
                </CommandEmpty>
                <CommandGroup>
                  {comboboxTags.map((tag) => (
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
        <Select>
          <SelectTrigger className="max-w-fit border-none p-0 focus:ring-0 focus-visible:ring-0">
            <div className="font-semibold text-muted-foreground hover:text-foreground">
              <SelectValue
                className="placeholder:text-muted-foreground"
                placeholder={"Article"}
              />
            </div>
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="note">
                <div className="flex items-center gap-x-1">
                  <StickyNote className="h-[0.9rem] w-[0.9rem]" />
                  <div>Note</div>
                </div>
              </SelectItem>
              <SelectItem value="article">
                <div className="flex items-center gap-x-1">
                  <NewspaperIcon className="h-[0.9rem] w-[0.9rem]" />
                  <div>Article</div>
                </div>
              </SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

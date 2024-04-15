import { createContextMenu } from "~/api";
import { fromNow } from "~/lib/utils";
import { useGlobalState } from "~/store";
import { type Note } from "~/types";

type Props = {
  note: Note;
};

export default function NoteCard({ note }: Props) {
  const { activeNote, setActiveNote } = useGlobalState();

  const handleSetActiveNote = (
    e: React.MouseEvent<HTMLDivElement, MouseEvent>,
  ) => {
    e.preventDefault();
    setActiveNote(note);
  };

  const handleContextMenu = async (
    e: React.MouseEvent<HTMLDivElement, MouseEvent>,
  ) => {
    e.preventDefault(); // prevent the default behaviour when right clicked
    console.log("Right Click");
    const id = note.id;
    await createContextMenu({ menuKind: "NoteItem", id });
  };

  // what can the title be?

  // the first line of the note

  // the first markdown heading

  function isMarkdownHeading(text: string) {
    // A regular expression that matches strings that start with one or more '#' characters followed by a space
    const headingRegex = /^#+\s.*$/;

    return headingRegex.test(text);
  }

  const parseTitle = (content: string) => {
    const firstLine = content.split("\n")[0];
    if (firstLine.length === 0) {
      const lines = content.split("\n");

      for (const line of lines) {
        if (isMarkdownHeading(line)) {
          return {
            title: line.replace(/^#+\s/, ""),
            lineNumber: lines.indexOf(line),
          };
        }
      }
    }

    let title = firstLine;

    if (isMarkdownHeading(firstLine)) {
      title = firstLine.replace(/^#+\s/, "");
    }

    if (title.length > 50) {
      title = title.slice(0, 50);
      title += "...";
    }

    title = title || "New Note";
    return { title, lineNumber: 0 };
  };

  // whatever the title is, remove it from the content

  const parseContent = (content: string) => {
    const lines = content.split("\n");
    if (lines.length === 1) {
      return "";
    }
    const contentWithoutTitle = lines.slice(1).join("\n");
    return contentWithoutTitle;
  };

  return (
    <div className="px-3">
      <div
        onContextMenu={handleContextMenu}
        onClick={handleSetActiveNote}
        key={note.id}
        className={`flex h-full w-full cursor-pointer select-none flex-col gap-y-1 rounded-md p-2 text-sm ${activeNote?.id === note.id && "bg-muted/80"}`}
      >
        <h2 className="select-none font-semibold text-primary">
          {parseTitle(note.content).title}
        </h2>
        <span className="select-none pb-6 text-muted-foreground">
          {parseContent(note.content)}
        </span>
        <span className="select-none text-xs text-muted-foreground/80">
          {fromNow(note.modifiedAt)}
        </span>
      </div>
    </div>
  );
}

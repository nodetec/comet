import { ScrollArea } from "../ui/scroll-area";
import NoteCard from "./NoteCard";

const notes = [
  {
    id: "1",
    title: "First Note",
    content: "This is the first note",
  },
  {
    id: "2",
    title: "Second Note",
    content: "This is the second note",
  },
  {
    id: "3",
    title: "Third Note",
    content: "This is the third note",
  },
  {
    id: "4",
    title: "Fourth Note",
    content: "This is the fourth note",
  },
  {
    id: "5",
    title: "Fifth Note",
    content: "This is the fifth note",
  },
  {
    id: "6",
    title: "Sixth Note",
    content: "This is the sixth note",
  },
  {
    id: "7",
    title: "Seventh Note",
    content: "This is the seventh note",
  },
  {
    id: "8",
    title: "Eighth Note",
    content: "This is the eighth note",
  },
  {
    id: "9",
    title: "Ninth Note",
    content: "This is the ninth note",
  },
  {
    id: "10",
    title: "Tenth Note",
    content: "This is the tenth note",
  },
  {
    id: "11",
    title: "Eleventh Note",
    content: "This is the eleventh note",
  },
  {
    id: "12",
    title: "Twelfth Note",
    content: "This is the twelfth note",
  },
  {
    id: "13",
    title: "Thirteenth Note",
    content: "This is the thirteenth note",
  },
  {
    id: "14",
    title: "Fourteenth Note",
    content: "This is the fourteenth note",
  },
  {
    id: "15",
    title: "Fifteenth Note",
    content: "This is the fifteenth note",
  },
];

export default function NoteFeed() {
  return (
    <ScrollArea className="h-[41.8rem] w-full rounded-md">
      <div className="flex flex-col">
        <ul>
          {notes.map((note) => (
            <li key={note.id}>
              <NoteCard note={note} />
            </li>
          ))}
        </ul>
      </div>
    </ScrollArea>
  );
}

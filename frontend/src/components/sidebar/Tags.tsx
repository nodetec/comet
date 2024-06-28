import { TagsIcon } from "lucide-react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../ui/accordion";
import Tag from "./Tag";

export default function AllNotes() {
  const data = [
    { id: "1", name: "Work" },
    { id: "2", name: "Personal" },
    { id: "3", name: "Important" },
    { id: "4", name: "Urgent" },
    { id: "5", name: "Home" },
    { id: "6", name: "School" },
    { id: "7", name: "Shopping" },
    { id: "8", name: "Health" },
    { id: "9", name: "Fitness" },
    { id: "10", name: "Travel" },
    { id: "11", name: "Books" },
    { id: "12", name: "Movies" },
    { id: "13", name: "Music" },
    { id: "14", name: "Food" },
    { id: "15", name: "Tech" },
    { id: "16", name: "Art" },
    { id: "17", name: "Design" },
    { id: "18", name: "Development" },
    { id: "19", name: "Writing" },
    { id: "20", name: "Photography" },
    { id: "21", name: "Video" },
    { id: "22", name: "Audio" },
    { id: "23", name: "Podcasts" },
    { id: "24", name: "News" },
    { id: "25", name: "Politics" },
    { id: "26", name: "Science" },
    { id: "27", name: "History" },
    { id: "28", name: "Philosophy" },
    { id: "29", name: "Psychology" },
    { id: "30", name: "Sociology" },
    { id: "31", name: "Economics" },
    { id: "32", name: "Business" },
    { id: "33", name: "Marketing" },
    { id: "34", name: "Sales" },
    { id: "35", name: "Management" },
    { id: "36", name: "Leadership" },
    { id: "37", name: "Productivity" },
    { id: "38", name: "Habits" },
    { id: "39", name: "Goals" },
    { id: "40", name: "Meditation" },
    { id: "41", name: "Yoga" },
    { id: "42", name: "Mindfulness" },
    { id: "43", name: "Spirituality" },
  ];

  return (
    <Accordion type="single" collapsible defaultValue="item-1">
      <AccordionItem className="border-none" value="item-1">
        <AccordionTrigger>
          <div className="flex pl-2 pr-2 text-muted-foreground">
            <TagsIcon className="h-[1.2rem] w-[1.2rem]" />
            <span className="ml-1">Tags</span>
          </div>
        </AccordionTrigger>
        <AccordionContent>
          {data?.map((tag) => <Tag key={tag.id} tag={tag} />)}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

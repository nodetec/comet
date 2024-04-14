import { Badge } from "../ui/badge";

const tags = ["donut", "sprinkle", "icening", "icening", "icening", "icening", "icening"];

export default function AssociatedTags() {
  return (
    <div className="flex gap-x-1 overflow-x-auto no-scrollbarshrink-1">
      {tags.map((tag) => {
        return <Badge variant="secondary">{tag}</Badge>;
      })}
    </div>
  );
}

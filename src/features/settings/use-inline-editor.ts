import { useState } from "react";

export function useInlineEditor() {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");

  const open = (initialValue = "") => {
    setValue(initialValue);
    setEditing(true);
  };

  const close = () => {
    setValue("");
    setEditing(false);
  };

  return { editing, value, setValue, open, close };
}

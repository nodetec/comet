import { type EditorThemeClasses } from "lexical";

import "./DefaultTheme.css";

const DefaultTheme: EditorThemeClasses = {
  autocomplete: "absolute bg-white border rounded-md shadow-lg p-2",
  blockCursor: "bg-black",
  code: "font-mono textCode text-sm bg-accent/50 text-accent-foreground p-4 block overflow-x-auto relative",
  embedBlock: {
    base: "border rounded-md p-2",
    focus: "border-blue-500 shadow",
  },
  hashtag: "text-sky-primary font-bold",
  heading: {
    h1: "text-3xl font-bold mb-2 mt-3",
    h2: "text-2xl font-bold mb-2 mt-3",
    h3: "text-xl font-bold mb-2 mt-3",
    h4: "text-lg font-bold mb-2 mt-3",
    h5: "text-lg font-bold mb-2 mt-3",
    h6: "text-lg font-bold mb-2 mt-3",
  },
  hr: "border-t my-4",
  image: "cursor-default inline-block relative select-none",
  link: "text-primary",

  list: {
    listitem: "ml-4",
    nested: {
      listitem: "list-none [&_:before]:hidden [&_:after]:hidden",
    },
    olDepth: [
      "list-decimal list-outside p-0 m-0 list-marker",
      "list-[upper-alpha] list-outside p-0 m-0 list-marker",
      "list-[lower-alpha] list-outside p-0 m-0 list-marker",
      "list-[upper-roman] list-outside p-0 m-0 list-marker",
      "list-[lower-roman] list-outside p-0 m-0 list-marker",
    ],
    ul: "list-disc list-outside p-0 m-0 list-marker list-padding",
  },
  ltr: "text-left",
  paragraph: "leading-relaxed",
  quote: "border-l-4 border-accent pl-4 italic text-accent-foreground/90",
  rtl: "text-right",
  text: {
    // base: "",
    bold: "font-bold",
    capitalize: "capitalize",
    code: "font-mono bg-accent/50 p-1 rounded",
    italic: "italic",
    lowercase: "lowercase",
    strikethrough: "line-through",
    subscript: "align-sub text-xs",
    superscript: "align-super text-xs",
    // markdown does not support underline
    // underline: "underline",
    underlineStrikethrough: "underline line-through",
    uppercase: "uppercase",
  },
};

export default DefaultTheme;

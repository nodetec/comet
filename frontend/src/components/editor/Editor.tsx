import {
  AdmonitionDirectiveDescriptor,
  codeBlockPlugin,
  codeMirrorPlugin,
  diffSourcePlugin,
  directivesPlugin,
  headingsPlugin,
  imagePlugin,
  linkDialogPlugin,
  linkPlugin,
  listsPlugin,
  markdownShortcutPlugin,
  MDXEditor,
  MDXEditorMethods,
  quotePlugin,
  tablePlugin,
  thematicBreakPlugin,
  toolbarPlugin,
} from "@mdxeditor/editor";

import "@mdxeditor/editor/style.css";

import { useEffect, useRef } from "react";

import { ScrollArea } from "../ui/scroll-area";
import { Toolbar } from "./Toolbar";

// import { Toolbar } from "~/components/article/Toolbar";
// import useStore from "~/store";

const allPlugins = (diffMarkdown: string) => [
  toolbarPlugin({ toolbarContents: () => <Toolbar /> }),
  listsPlugin(),
  quotePlugin(),
  headingsPlugin(),
  linkPlugin(),
  linkDialogPlugin(),

  // eslint-disable-next-line @typescript-eslint/require-await
  imagePlugin(),
  tablePlugin(),
  thematicBreakPlugin(),
  codeBlockPlugin({ defaultCodeBlockLanguage: "txt" }),
  codeMirrorPlugin({
    codeBlockLanguages: {
      js: "JavaScript",
      css: "CSS",
      txt: "text",
      tsx: "TypeScript",
    },
  }),
  directivesPlugin({ directiveDescriptors: [AdmonitionDirectiveDescriptor] }),
  diffSourcePlugin({ viewMode: "rich-text", diffMarkdown }),
  markdownShortcutPlugin(),
];

export default function WritePage() {
  // save content to store on unmount
  const mdxEditorRef = useRef<MDXEditorMethods>(null);

  // const setMdxEditorRef = useStore((state) => state.setMdxEditorRef);

  // useEffect(() => {
  //   setMdxEditorRef(mdxEditorRef.current ?? undefined);
  // }, [mdxEditorRef, setMdxEditorRef]);

  return (
      <ScrollArea className="flex h-full flex-col p-2 border-4 border-blue-500">
        <MDXEditor
          ref={mdxEditorRef}
          markdown={"# Your title"}
          className="dark-editor max-w-full h-72 border-4 border-green-500"
          contentEditableClassName="dark:prose-invert prose max-w-full h-full font-sans border-4 border-yellow-500"
          plugins={allPlugins("# Your title")}
        />
      </ScrollArea>
  );
}

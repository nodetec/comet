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

import { useRef } from "react";

import { Toolbar } from "./Toolbar";

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
  const mdxEditorRef = useRef<MDXEditorMethods>(null);

  return (
    <MDXEditor
      ref={mdxEditorRef}
      markdown={"# Header \n some inline code `const x = 9` \n **bold text**"}
      className="dark-editor flex h-full flex-col overflow-hidden"
      contentEditableClassName="dark:prose-invert prose max-w-full !h-full !grow border-t border-black"
      plugins={allPlugins("# Your title")}
    />
  );
}

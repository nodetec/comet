import { useCM6Editor } from "~/hooks/useCM6Editor";

export const Editor1 = () => {
  const { editorRef } = useCM6Editor();

  return (
    <div
      className="editor-container h-full w-full overflow-y-auto"
      ref={editorRef}
    />
  );
};

export default Editor1;

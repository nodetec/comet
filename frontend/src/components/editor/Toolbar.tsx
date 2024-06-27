import {
  BlockTypeSelect,
  BoldItalicUnderlineToggles,
  ChangeCodeMirrorLanguage,
  CodeToggle,
  ConditionalContents,
  CreateLink,
  DiffSourceToggleWrapper,
  InsertCodeBlock,
  InsertImage,
  InsertTable,
  InsertThematicBreak,
  ListsToggle,
  Separator,
  UndoRedo,
} from "@mdxeditor/editor";

export const Toolbar: React.FC = () => {
  return (
    <DiffSourceToggleWrapper>
      <ConditionalContents
        options={[
          // {
          //   when: (editor) => editor?.editorType === "codeblock",
          //   contents: () => <ChangeCodeMirrorLanguage />,
          // },
          {
            fallback: () => (
              <>
                {/* <UndoRedo /> */}
                {/* <Separator /> */}
                <BoldItalicUnderlineToggles />
                {/* <CodeToggle /> */}
                {/* <Separator /> */}
                {/* <ListsToggle /> */}
                <Separator />

                <ConditionalContents
                  options={[{ fallback: () => <BlockTypeSelect /> }]}
                />

                <Separator />

                {/* <CreateLink /> */}
                {/* <InsertImage /> */}

                <Separator />

                <InsertTable />
                <InsertThematicBreak />

                {/* <Separator /> */}
                {/* <InsertCodeBlock /> */}
              </>
            ),
          },
        ]}
      />
    </DiffSourceToggleWrapper>
  );
};

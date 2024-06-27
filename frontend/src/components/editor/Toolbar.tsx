import {
  BoldItalicUnderlineToggles,
  ConditionalContents,
} from "@mdxeditor/editor";

export const Toolbar: React.FC = () => {
  return (
    <ConditionalContents
      options={[
        {
          fallback: () => (
            <>
              <BoldItalicUnderlineToggles />
            </>
          ),
        },
      ]}
    />
  );
};

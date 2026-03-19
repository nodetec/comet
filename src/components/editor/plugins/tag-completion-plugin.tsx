import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  LexicalTypeaheadMenuPlugin,
  MenuOption,
  useBasicTypeaheadTriggerMatch,
} from "@lexical/react/LexicalTypeaheadMenuPlugin";
import { $createTextNode, TextNode } from "lexical";
import { invoke } from "@tauri-apps/api/core";

class TagOption extends MenuOption {
  tag: string;
  constructor(tag: string) {
    super(tag);
    this.tag = tag;
  }
}

function TagMenuItem({
  isSelected,
  onClick,
  onMouseEnter,
  option,
}: {
  isSelected: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
  option: TagOption;
}) {
  return (
    <li
      role="option"
      aria-selected={isSelected}
      className={`cursor-pointer px-3 py-1.5 text-sm ${
        isSelected ? "bg-accent text-accent-foreground" : ""
      }`}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
    >
      <span className="text-muted-foreground">#</span>
      {option.tag}
    </li>
  );
}

function useTagSearch(query: string | null) {
  const [results, setResults] = useState<string[]>([]);

  useEffect(() => {
    if (query === null || query.length === 0) {
      setResults([]);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      void invoke<string[]>("search_tags", { query }).then(
        (tags) => {
          if (!cancelled) {
            // Filter out tags that exactly match the current query
            setResults(tags.filter((t) => t !== query.toLowerCase()));
          }
        },
        () => {
          if (!cancelled) setResults([]);
        },
      );
    }, 150);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  return results;
}

export default function TagCompletionPlugin() {
  const [editor] = useLexicalComposerContext();
  const [queryString, setQueryString] = useState<string | null>(null);

  const checkForTriggerMatch = useBasicTypeaheadTriggerMatch("#", {
    minLength: 1,
  });

  const results = useTagSearch(queryString);

  const options = useMemo(
    () => results.map((tag) => new TagOption(tag)),
    [results],
  );

  const onSelectOption = useCallback(
    (
      selectedOption: TagOption,
      nodeToReplace: TextNode | null,
      closeMenu: () => void,
    ) => {
      editor.update(() => {
        const tagText = `#${selectedOption.tag} `;
        const newNode = $createTextNode(tagText);
        if (nodeToReplace) {
          nodeToReplace.replace(newNode);
        }
        newNode.select();
        closeMenu();
      });
    },
    [editor],
  );

  return (
    <LexicalTypeaheadMenuPlugin<TagOption>
      onQueryChange={setQueryString}
      onSelectOption={onSelectOption}
      triggerFn={checkForTriggerMatch}
      options={options}
      menuRenderFn={(
        anchorElementRef,
        { selectedIndex, selectOptionAndCleanUp, setHighlightedIndex, options },
      ) => {
        if (options.length === 0 || !anchorElementRef.current) {
          return null;
        }

        return createPortal(
          <ul
            role="listbox"
            className="min-w-[160px] overflow-hidden rounded-md border border-border bg-popover py-1 shadow-md"
          >
            {options.map((option, i) => (
              <TagMenuItem
                key={option.key}
                isSelected={selectedIndex === i}
                onClick={() => selectOptionAndCleanUp(option)}
                onMouseEnter={() => setHighlightedIndex(i)}
                option={option}
              />
            ))}
          </ul>,
          anchorElementRef.current,
        );
      }}
    />
  );
}

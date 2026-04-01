import type { MultilineElementTransformer } from "@lexical/markdown";
import { CODE } from "@lexical/markdown";
import { $createCodeNode, $isCodeNode } from "@lexical/code";
import type { ElementNode, LexicalNode } from "lexical";
import { $createTextNode } from "lexical";

/**
 * Custom CODE transformer that:
 * 1. Treats 'plain' as no language tag in export
 * 2. Preserves trailing blank lines inside code blocks on import
 *    (Lexical's built-in CODE transformer strips them)
 */
export const CODE_BLOCK: MultilineElementTransformer = {
  ...CODE,
  export: (node: LexicalNode) => {
    if (!$isCodeNode(node)) {
      return null;
    }
    const language = node.getLanguage();
    const textContent = node.getTextContent();

    if (language === "indented" && textContent.length > 0) {
      return textContent
        .split("\n")
        .map((line) => `    ${line}`)
        .join("\n");
    }

    const languageTag = language && language !== "plain" ? language : "";

    // Use dynamic fence length: find the longest run of backticks in the
    // content and use one more than that (minimum 3).
    let maxRun = 0;
    const backtickRuns = textContent.match(/`+/g);
    if (backtickRuns) {
      for (const run of backtickRuns) {
        maxRun = Math.max(maxRun, run.length);
      }
    }
    const fence = "`".repeat(Math.max(3, maxRun + 1));

    return (
      fence +
      languageTag +
      (textContent ? "\n" + textContent : "") +
      "\n" +
      fence
    );
  },
  // Override handleImportAfterStartMatch because the inherited version
  // calls CODE.replace directly (which strips trailing blank lines),
  // bypassing our replace override.
  handleImportAfterStartMatch: ({
    lines,
    rootNode,
    startLineIndex,
    startMatch,
  }) => {
    const fence = startMatch[1];
    const fenceLength = fence.trim().length;
    const currentLine = lines[startLineIndex];
    const afterFenceIndex = startMatch.index! + fence.length;
    const afterFence = currentLine.slice(afterFenceIndex);

    // Single-line code block: ```code```
    const singleLineEndRegex = new RegExp(`\`{${fenceLength},}$`);
    if (singleLineEndRegex.test(afterFence)) {
      const endMatch = singleLineEndRegex.exec(afterFence)!;
      const content = afterFence.slice(0, afterFence.lastIndexOf(endMatch[0]));
      const fakeStartMatch = [...startMatch];
      fakeStartMatch[2] = "";
      CODE_BLOCK.replace!(
        rootNode,
        null,
        fakeStartMatch,
        endMatch,
        [content],
        true,
      );
      return [true, startLineIndex] as [boolean, number];
    }

    // Multi-line: find closing fence
    const multilineEndRegex = new RegExp(`^[ \\t]*\`{${fenceLength},}$`);
    for (let i = startLineIndex + 1; i < lines.length; i++) {
      if (multilineEndRegex.test(lines[i])) {
        const endMatch = multilineEndRegex.exec(lines[i]);
        const linesInBetween = lines.slice(startLineIndex + 1, i);
        const afterFullMatch = currentLine.slice(startMatch[0].length);
        if (afterFullMatch.length > 0) {
          linesInBetween.unshift(afterFullMatch);
        }
        CODE_BLOCK.replace!(
          rootNode,
          null,
          startMatch,
          endMatch,
          linesInBetween,
          true,
        );
        return [true, i] as [boolean, number];
      }
    }

    // No closing fence found — consume rest of document
    const linesInBetween = lines.slice(startLineIndex + 1);
    const afterFullMatch = currentLine.slice(startMatch[0].length);
    if (afterFullMatch.length > 0) {
      linesInBetween.unshift(afterFullMatch);
    }
    CODE_BLOCK.replace!(rootNode, null, startMatch, null, linesInBetween, true);
    return [true, lines.length - 1] as [boolean, number];
  },
  replace: (
    rootNode: ElementNode,
    children: LexicalNode[] | null,
    startMatch: string[],
    endMatch: string[] | null,
    linesInBetween: string[] | null,
    isImport?: boolean,
  ) => {
    // Shortcut mode (user typed ``` + Enter): children is set, linesInBetween is null.
    // Delegate to the default CODE transformer which handles node replacement.
    if (children) {
      return CODE.replace(
        rootNode,
        children,
        startMatch,
        endMatch,
        linesInBetween,
        isImport ?? false,
      );
    }
    if (!linesInBetween) return;

    const language = startMatch[2] || undefined;
    const codeBlockNode = $createCodeNode(language);

    let code: string;
    if (linesInBetween.length === 1) {
      code = linesInBetween[0];
    } else {
      // Strip leading empty/indented line (Lexical convention)
      if (linesInBetween.length > 0) {
        if (linesInBetween[0].trim().length === 0) {
          linesInBetween.shift();
        } else if (linesInBetween[0].startsWith(" ")) {
          linesInBetween[0] = linesInBetween[0].slice(1);
        }
      }
      // NOTE: intentionally NOT stripping trailing blank lines
      code = linesInBetween.join("\n");
    }

    const textNode = $createTextNode(code);
    codeBlockNode.append(textNode);
    rootNode.append(codeBlockNode);
  },
};

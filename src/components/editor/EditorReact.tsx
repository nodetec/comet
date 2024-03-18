import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { vim } from "@replit/codemirror-vim";
import CodeMirror from "@uiw/react-codemirror";
import useThemeChange from "~/hooks/useThemeChange";

import { darkTheme, lightTheme } from "./editor-themes";

const code = `## Title

\`\`\`jsx
function Demo() {
  return <div>demo</div>
}
\`\`\`

\`\`\`bash
# Not dependent on uiw.
npm install @codemirror/lang-markdown --save
npm install @codemirror/language-data --save
\`\`\`

[weisit ulr](https://uiwjs.github.io/react-codemirror/)

\`\`\`go
package main
import "fmt"
func main() {
  fmt.Println("Hello, 世界")
}
\`\`\`
`;

export default function Editor() {
  const theme = useThemeChange();
  return (
    <CodeMirror
      style={{ height: "100%", overflowY: "auto" }}
      value={code}
      basicSetup={{
        lineNumbers: false,
        foldGutter: false,
        autocompletion: false,
        highlightActiveLine: false,
      }}
      extensions={[
        // vim(),
        theme === "dark" ? darkTheme : lightTheme,
        markdown({
          base: markdownLanguage,
          codeLanguages: languages,
        }),
      ]}
    />
  );
}

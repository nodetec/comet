import { type Compartment } from "@codemirror/state";
import { EditorView } from "codemirror";

export function customizeEditorThemeStyles(
  view: EditorView,
  compartment: Compartment,
  className: string,
  setting: string,
) {
  if (className === "fontSize") {
    setting = setting + "px";
  }

  const theme = EditorView.theme({
    ".cm-content": {
      [className]: setting,
    },
    ".cm-gutters": {
      [className]: setting,
    },
  });

  view.dispatch({
    effects: compartment.reconfigure(theme),
  });
}

export function indentUnitWhitespace(indentUnitSetting: string) {
  return " ".repeat(Number(indentUnitSetting));
}

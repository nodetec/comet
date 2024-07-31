import { type Compartment } from "@codemirror/state";
import { EditorView } from "codemirror";

export function customizeEditorThemeStyles(
  view: EditorView,
  compartment: Compartment,
  className: string,
  setting: string | undefined,
) {
  if (className === "fontSize") {
    if (setting === "small") {
      setting = "13px";
    } else if (setting === "default") {
      setting = "15px";
    } else {
      setting = "17px";
    }
  }

  if (setting !== undefined) {
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
}

export function indentUnitWhitespace(indentUnitSetting: string | undefined) {
  if (indentUnitSetting !== undefined) {
    return " ".repeat(Number(indentUnitSetting));
  } else {
    return "    ";
  }
}

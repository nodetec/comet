import { Minus, Plus } from "lucide-react";

import { Button } from "@/shared/ui/button";
import { Switch } from "@/shared/ui/switch";
import {
  useEditorFontSize,
  useEditorSpellCheck,
  useEditorVimMode,
  useShowEditorToolbar,
  useUIActions,
} from "@/features/settings/store/use-ui-store";

import { SettingRow } from "./setting-row";

export function EditorSettings() {
  const showToolbar = useShowEditorToolbar();
  const fontSize = useEditorFontSize();
  const spellCheck = useEditorSpellCheck();
  const vimMode = useEditorVimMode();
  const {
    setShowEditorToolbar: setShowToolbar,
    setEditorFontSize: setFontSize,
    setEditorSpellCheck: setSpellCheck,
    setEditorVimMode: setVimMode,
  } = useUIActions();

  return (
    <div>
      <h3 className="mb-2 text-sm font-medium">Editor</h3>
      <SettingRow
        label="Editor Toolbar"
        description="Show the formatting toolbar below the editor"
      >
        <Switch checked={showToolbar} onCheckedChange={setShowToolbar} />
      </SettingRow>
      <SettingRow label="Font Size" description="Base font size for the editor">
        <div className="flex items-center gap-1.5">
          <Button
            size="icon-xs"
            variant="outline"
            onClick={() => setFontSize(fontSize - 1)}
            disabled={fontSize <= 12}
          >
            <Minus />
          </Button>
          <span className="w-10 text-center text-sm tabular-nums">
            {fontSize}px
          </span>
          <Button
            size="icon-xs"
            variant="outline"
            onClick={() => setFontSize(fontSize + 1)}
            disabled={fontSize >= 20}
          >
            <Plus />
          </Button>
        </div>
      </SettingRow>
      <SettingRow
        label="Spell Check"
        description="Enable browser spell checking in the editor"
      >
        <Switch checked={spellCheck} onCheckedChange={setSpellCheck} />
      </SettingRow>
      <SettingRow
        label="Vim Mode"
        description="Use Vim keybindings in the editor"
        border={false}
      >
        <Switch checked={vimMode} onCheckedChange={setVimMode} />
      </SettingRow>
    </div>
  );
}

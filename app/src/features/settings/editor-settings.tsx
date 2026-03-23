import { Minus, Plus } from "lucide-react";

import { Button } from "@/shared/ui/button";
import { Switch } from "@/shared/ui/switch";
import { useUIStore } from "@/features/settings/store/use-ui-store";

import { SettingRow } from "./setting-row";

export function EditorSettings() {
  const showToolbar = useUIStore((s) => s.showEditorToolbar);
  const setShowToolbar = useUIStore((s) => s.setShowEditorToolbar);
  const fontSize = useUIStore((s) => s.editorFontSize);
  const setFontSize = useUIStore((s) => s.setEditorFontSize);
  const spellCheck = useUIStore((s) => s.editorSpellCheck);
  const setSpellCheck = useUIStore((s) => s.setEditorSpellCheck);

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
        border={false}
      >
        <Switch checked={spellCheck} onCheckedChange={setSpellCheck} />
      </SettingRow>
    </div>
  );
}

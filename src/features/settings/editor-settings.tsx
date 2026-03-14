import { Minus, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useUIStore } from "@/stores/use-ui-store";

function SettingRow({
  label,
  description,
  children,
  border = true,
}: {
  label: string;
  description: string;
  children: React.ReactNode;
  border?: boolean;
}) {
  return (
    <div
      className={[
        "flex items-center justify-between gap-6 py-3",
        border ? "border-b" : "",
      ].join(" ")}
    >
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-muted-foreground text-xs">{description}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

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
        <Switch
          checked={showToolbar}
          onCheckedChange={setShowToolbar}
        />
      </SettingRow>
      <SettingRow
        label="Font Size"
        description="Base font size for the editor"
      >
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
        <Switch
          checked={spellCheck}
          onCheckedChange={setSpellCheck}
        />
      </SettingRow>
    </div>
  );
}
